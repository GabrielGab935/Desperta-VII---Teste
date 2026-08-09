import flask
import os
import re
import json
from datetime import datetime
from io import BytesIO

import gspread
from google.oauth2.service_account import Credentials

import cloudinary
import cloudinary.uploader

from PIL import Image, ImageOps

# Registra o suporte a HEIC/HEIF (fotos de iPhone) no Pillow
from pillow_heif import register_heif_opener
register_heif_opener()

# IMPORTAR GERADOR DE CRACHÁ
from gerar_cracha import gerar_cracha

# ══════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO CLOUDINARY
# ══════════════════════════════════════════════════════════════════
cloudinary.config(    
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"]
)

# ══════════════════════════════════════════════════════════════════
# CONFIGURAÇÕES
# ══════════════════════════════════════════════════════════════════
NOME_PLANILHA = "VII Desperta"  # Nome da planilha no Google Sheets

# Nome da aba (worksheet) usada pela agenda/calendário dentro da mesma planilha
NOME_ABA_INSCRICOES = os.environ.get("SHEET_NAME_INSCRICOES", "inscrições")
NOME_ABA_EVENTOS = os.environ.get("SHEET_NAME_EVENTOS", "eventos")

# ══════════════════════════════════════════════════════════════════
# GOOGLE SHEETS
# ══════════════════════════════════════════════════════════════════
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]


def get_credenciais():
    """Carrega as credenciais do Google, seja do arquivo local ou da env var da Vercel."""

    # Se existir o arquivo, usa ele (desenvolvimento local)
    if os.path.exists("credenciais.json"):

        creds = Credentials.from_service_account_file(
            "credenciais.json",
            scopes=SCOPES
        )

    # Caso contrário, usa a variável da Vercel
    else:

        creds_json = os.environ["GOOGLE_CREDENTIALS_JSON"]

        creds_dict = json.loads(creds_json)

        creds = Credentials.from_service_account_info(
            creds_dict,
            scopes=SCOPES
        )

    return creds


def get_planilha():
    """Retorna a primeira aba da planilha (cadastro de participantes)."""

    creds = get_credenciais()

    cliente_sheet = gspread.authorize(creds)

    return cliente_sheet.open(NOME_PLANILHA).sheet1


def get_aba_eventos():
    """Retorna a aba 'eventos' (agenda/calendário) dentro da mesma planilha."""

    creds = get_credenciais()

    cliente_sheet = gspread.authorize(creds)

    return cliente_sheet.open(NOME_PLANILHA).worksheet(NOME_ABA_EVENTOS)


# ══════════════════════════════════════════════════════════════════
# AGENDA / CALENDÁRIO — HELPERS
# ══════════════════════════════════════════════════════════════════

def parse_cronograma(raw):
    """Converte 'Sex 18h|Chegada; Sáb 09h|Palavra' em uma lista de dicts."""
    if not raw:
        return []
    items = []
    for chunk in raw.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "|" in chunk:
            horario, atividade = chunk.split("|", 1)
        else:
            horario, atividade = "", chunk
        items.append({"horario": horario.strip(), "atividade": atividade.strip()})
    return items


def parse_date(raw):
    """Normaliza datas para AAAA-MM-DD, aceitando alguns formatos comuns."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    for fmt in ("%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw  # devolve como veio, para não quebrar — corrija na planilha


# ══════════════════════════════════════════════════════════════════
# NORMALIZAÇÃO DA FOTO ENVIADA
# ══════════════════════════════════════════════════════════════════

def normalizar_foto(foto_file, max_dimensao=1600, qualidade=85):
    """
    Converte a foto enviada pelo formulário (que pode vir em HEIC/HEIF do
    iPhone, WEBP, PNG, etc.) para um JPEG padrão, já com a orientação EXIF
    corrigida, e redimensiona se estiver maior que o necessário.

    O redimensionamento é feito aqui no servidor como uma segurança extra:
    a compressão do lado do navegador (JS) pode ser pulada (ex.: fotos
    HEIC, que o navegador não consegue abrir em canvas) ou falhar por
    qualquer outro motivo, então o backend garante que a imagem final
    nunca chega gigante — tanto pro upload no Cloudinary quanto pra
    geração do crachá.

    Isso é feito ANTES de qualquer outra coisa, para que tanto a geração do
    crachá quanto o upload da foto original no Cloudinary usem sempre o
    mesmo arquivo, num formato e tamanho previsíveis.

    Retorna um BytesIO pronto para ser lido (posição já no início).
    """

    foto_file.seek(0)

    imagem = Image.open(foto_file)

    # Corrige a orientação (fotos de celular vêm com metadado de rotação)
    imagem = ImageOps.exif_transpose(imagem)

    imagem = imagem.convert("RGB")

    # Redimensiona mantendo a proporção, só se a foto for maior que o limite
    largura, altura = imagem.size

    if largura > max_dimensao or altura > max_dimensao:
        imagem.thumbnail((max_dimensao, max_dimensao), Image.Resampling.LANCZOS)

    buffer = BytesIO()

    imagem.save(buffer, format="JPEG", quality=qualidade, optimize=True)

    buffer.seek(0)

    return buffer


# ══════════════════════════════════════════════════════════════════
# VALIDAÇÃO DO FORMULÁRIO DE INSCRIÇÃO
# ══════════════════════════════════════════════════════════════════

# Campos de texto/seleção obrigatórios: (nome_no_form, rótulo amigável)
CAMPOS_OBRIGATORIOS = [
    ("nome", "Nome completo"),
    ("telefone", "Telefone"),
    ("email", "E-mail"),
    ("data_nascimento", "Data de nascimento"),
    ("nome_responsavel", "Nome do responsável"),
    ("grau_parentesco", "Grau de parentesco"),
    ("telefone_responsavel", "Telefone do responsável"),
    ("retiro_ant", "Se já participou de algum retiro"),
    ("expectativa", "Expectativa sobre o retiro"),
    ("alergia", "Se possui alergia alimentar"),
    ("remedio", "Se utiliza algum medicamento"),
    ("direito_de_imag", "Autorização de uso de imagem"),
]

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validar_formulario(form):
    """
    Valida os campos obrigatórios no servidor (não confiar apenas no JS
    do navegador). Retorna uma lista de mensagens de erro; lista vazia
    significa que passou na validação.
    """

    erros = []

    for campo, rotulo in CAMPOS_OBRIGATORIOS:
        valor = (form.get(campo) or "").strip()
        if not valor:
            erros.append(f"O campo \"{rotulo}\" é obrigatório.")

    email = (form.get("email") or "").strip()
    if email and not EMAIL_REGEX.match(email):
        erros.append("Informe um e-mail válido.")

    # Campos "extras" condicionais: se marcou "sim", a descrição não pode
    # ficar vazia.
    if (form.get("alergia") or "").strip() == "sim" and not (form.get("descricao_alergia") or "").strip():
        erros.append("Descreva sua alergia alimentar.")

    if (form.get("remedio") or "").strip() == "sim" and not (form.get("nome_medicamento") or "").strip():
        erros.append("Informe o(s) medicamento(s) que utiliza.")

    return erros


def row_to_event(row, idx):
    return {
        "id": row.get("id") or f"evento-{idx}",
        "titulo": row.get("titulo", "").strip(),
        "categoria": row.get("categoria", "").strip(),
        "cor": row.get("cor", "#c9a869").strip() or "#c9a869",
        "data_inicio": parse_date(row.get("data_inicio")),
        "data_fim": parse_date(row.get("data_fim")) or parse_date(row.get("data_inicio")),
        "horario": row.get("horario", "").strip(),
        "local": row.get("local", "").strip(),
        "descricao": row.get("descricao", "").strip(),
        "cronograma": parse_cronograma(row.get("cronograma", "")),
    }


# ══════════════════════════════════════════════════════════════════
# FLASK
# ══════════════════════════════════════════════════════════════════
app = flask.Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

from werkzeug.exceptions import RequestEntityTooLarge

# ══════════════════════════════════════════════════════════════════
# ROTAS
# ══════════════════════════════════════════════════════════════════

@app.errorhandler(RequestEntityTooLarge)
def erro_arquivo_grande(e):
    """
    Se o arquivo enviado (geralmente a foto) ultrapassar o MAX_CONTENT_LENGTH,
    mostra uma mensagem amigável no próprio formulário em vez da tela de
    erro genérica do servidor.
    """
    return flask.render_template(
        "formulario.html",
        erro="A foto enviada é muito grande. Tente novamente com uma foto menor, "
             "ou tire um print/captura de tela dela antes de enviar."
    ), 413

@app.route("/")
def home():
    return flask.render_template("index.html")


@app.route("/formulario")
def formulario():
    return flask.render_template("formulario.html")


@app.route("/agenda")
def agenda():
    return flask.render_template("agenda.html")


@app.route("/api/events")
def api_events():
    try:
        creds = get_credenciais()
        cliente_sheet = gspread.authorize(creds)

        sheet = get_aba_eventos()
        rows = sheet.get_all_records()
        
        events = [
            row_to_event(row, i)
            for i, row in enumerate(rows)
            if row.get("titulo") and row.get("data_inicio")
        ]
        return flask.jsonify(events)

    except Exception as exc:
        print(f"[ERRO AGENDA] {exc}")
        return flask.jsonify({"error": str(exc)}), 500


@app.route("/enviar", methods=["POST"])
def enviar():

    # ══════════════════════════════════════════════════════════════
    # VALIDAÇÃO SERVER-SIDE
    # (o JS do formulário já valida no navegador, mas nunca confiamos
    # só nisso: se o JS falhar ou for pulado, o servidor barra aqui)
    # ══════════════════════════════════════════════════════════════
    erros = validar_formulario(flask.request.form)

    if erros:
        return flask.render_template(
            "formulario.html",
            erro=" ".join(erros)
        ), 400

    try:
        planilha = get_planilha()
    except Exception as exc:
        print(f"[ERRO PLANILHA] {exc}")
        return flask.render_template(
            "formulario.html",
            erro="Não foi possível conectar ao sistema de inscrições agora. "
                 "Tente novamente em alguns instantes."
        ), 500

    # ══════════════════════════════════════════════════════════════
    # DADOS PESSOAIS
    # ══════════════════════════════════════════════════════════════
    nome = flask.request.form.get("nome", "").strip()

    telefone = flask.request.form.get(
        "telefone",
        ""
    ).strip()

    email = flask.request.form.get(
        "email",
        ""
    ).strip()

    data_nascimento = flask.request.form.get(
        "data_nascimento",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # RESPONSÁVEL
    # ══════════════════════════════════════════════════════════════
    nome_responsavel = flask.request.form.get(
        "nome_responsavel",
        ""
    ).strip()

    grau_parentesco = flask.request.form.get(
        "grau_parentesco",
        ""
    ).strip()

    telefone_responsavel = flask.request.form.get(
        "telefone_responsavel",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # SOBRE VOCÊ
    # ══════════════════════════════════════════════════════════════
    retiro_ant = flask.request.form.get(
        "retiro_ant",
        ""
    ).strip()

    expectativa = flask.request.form.get(
        "expectativa",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # SAÚDE
    # ══════════════════════════════════════════════════════════════
    alergia = flask.request.form.get(
        "alergia",
        ""
    ).strip()

    descricao_alergia = flask.request.form.get(
        "descricao_alergia",
        ""
    ).strip()

    remedio = flask.request.form.get(
        "remedio",
        ""
    ).strip()

    nome_medicamento = flask.request.form.get(
        "nome_medicamento",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # FOTO
    # ══════════════════════════════════════════════════════════════
    link_foto = ""
    link_cracha = ""

    direito_de_imag = flask.request.form.get(
        "direito_de_imag",
        ""
    ).strip()

    foto = flask.request.files.get("foto_participante")

    if foto and foto.filename:

        try:

            # ══════════════════════════════════════════════════════
            # 1) NORMALIZA A FOTO PRIMEIRO (HEIC/HEIF/PNG/WEBP → JPEG)
            # ══════════════════════════════════════════════════════
            foto_normalizada = normalizar_foto(foto)

            # ══════════════════════════════════════════════════════
            # 2) GERA O CRACHÁ A PARTIR DA FOTO JÁ NORMALIZADA
            # ══════════════════════════════════════════════════════
            foto_normalizada.seek(0)
            buffer_cracha = gerar_cracha(
                nome,
                foto_normalizada
            )

            # ══════════════════════════════════════════════════════
            # 3) UPLOAD DA FOTO ORIGINAL (já normalizada) NO CLOUDINARY
            # ══════════════════════════════════════════════════════
            foto_normalizada.seek(0)
            resultado_foto = cloudinary.uploader.upload(
                foto_normalizada,
                folder="fotos_participantes",
                format="jpg"
            )

            link_foto = resultado_foto["secure_url"]

            # ══════════════════════════════════════════════════════
            # 4) UPLOAD DO CRACHÁ GERADO NO CLOUDINARY
            # ══════════════════════════════════════════════════════
            resultado_cracha = cloudinary.uploader.upload(
                buffer_cracha,
                folder="crachas_desperta",
                resource_type="image"
            )

            link_cracha = resultado_cracha["secure_url"]

            buffer_cracha.close()
            foto_normalizada.close()

        except Exception as e:

            print(f"[ERRO CLOUDINARY] {e}")

            # Não grava "Erro: ..." como se fosse um link válido na
            # planilha. A inscrição é interrompida e o usuário é avisado,
            # em vez de seguir em frente com dados incompletos/errados.
            return flask.render_template(
                "formulario.html",
                erro="Não foi possível processar sua foto agora. "
                     "Tente novamente com outra foto ou tente novamente "
                     "em alguns instantes."
            ), 500

    # ══════════════════════════════════════════════════════════════
    # SALVAR NA PLANILHA
    # ══════════════════════════════════════════════════════════════
    # (removidos os prints de depuração com dados pessoais dos
    # inscritos — nome, telefone, alergias, medicamentos etc. não
    # devem ir para o log do servidor em produção)

    planilha.append_row([

        nome,
        telefone,
        email,
        data_nascimento,

        nome_responsavel,
        grau_parentesco,
        telefone_responsavel,

        retiro_ant,
        expectativa,

        alergia,
        descricao_alergia,

        remedio,
        nome_medicamento,

        direito_de_imag,
        link_foto,
        link_cracha

    ], value_input_option="USER_ENTERED")

    # ══════════════════════════════════════════════════════════════
    # RETORNO
    # ══════════════════════════════════════════════════════════════
    return flask.render_template(
        "formulario.html",
        sucesso=True,
        nome=nome
    )

# ══════════════════════════════════════════════════════════════════
# INICIAR APP
# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port
    )
