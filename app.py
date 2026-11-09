import flask
import os
import re
import json
from datetime import datetime
from io import BytesIO
from functools import wraps

from werkzeug.security import check_password_hash
from werkzeug.exceptions import RequestEntityTooLarge

import gspread
from gspread.utils import rowcol_to_a1
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

# Aba onde cada pagamento registrado pela coordenação é gravado (uma linha
# por pagamento). É criada automaticamente na primeira vez que for usada.
NOME_ABA_PAGAMENTOS = os.environ.get("SHEET_NAME_PAGAMENTOS", "pagamentos")

# Valor total do retiro (usado para calcular "pago / parcial / pendente").
VALOR_RETIRO = float(os.environ.get("VALOR_RETIRO", "100.00"))

# Valor extra cobrado de quem optar por adquirir a camiseta do evento.
VALOR_CAMISETA = float(os.environ.get("VALOR_CAMISETA", "50.00"))

# Número máximo de inscrições aceitas para esta edição do retiro.
# Para abrir mais vagas, mude essa variável de ambiente e reinicie o servidor.
VAGAS_TOTAL = int(os.environ.get("VAGAS_TOTAL", "80"))

# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO (login/admin)
# ══════════════════════════════════════════════════════════════════
# ADMIN_EMAIL: e-mail de acesso da coordenação.
# ADMIN_SENHA_HASH: gerado uma vez com:
#   python3 -c "from werkzeug.security import generate_password_hash as g; print(g('sua_senha_aqui'))"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_SENHA_HASH = os.environ.get("ADMIN_SENHA_HASH", "")

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


def get_aba_pagamentos():
    """
    Retorna a aba 'pagamentos' (uma linha por pagamento registrado pela
    coordenação). Se ainda não existir na planilha, ela é criada
    automaticamente com o cabeçalho esperado.
    """

    creds = get_credenciais()

    cliente_sheet = gspread.authorize(creds)

    planilha_obj = cliente_sheet.open(NOME_PLANILHA)

    try:
        return planilha_obj.worksheet(NOME_ABA_PAGAMENTOS)
    except gspread.exceptions.WorksheetNotFound:
        aba = planilha_obj.add_worksheet(title=NOME_ABA_PAGAMENTOS, rows=1000, cols=5)
        aba.append_row(["participante_id", "data", "valor", "obs", "registrado_em"])
        return aba


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
    Converte a foto enviada (HEIC/HEIF do iPhone, WEBP, PNG, etc.) para um
    JPEG padrão, com a orientação EXIF corrigida, redimensionando se for
    maior que o necessário. Usada tanto na inscrição quanto no crachá avulso.

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
    ("chamou_ret", "Como ficou sabendo do retiro"),
    ("ansiedade", "Como está a ansiedade para o retiro"),

    ("carne_sex", "Alimentação sem carne às sextas-feiras"),
    ("alergia", "Se possui alergia alimentar"),
    ("remedio", "Se utiliza algum medicamento"),
    ("necessidade", "Se há alguma necessidade especial"),

    ("transporte", "Como irá se deslocar até o retiro"),
    ("forma_pagamento", "Forma de pagamento"),

    ("direito_de_imag", "Autorização de uso de imagem"),
]

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

TAMANHOS_VALIDOS = ("PP", "P", "M", "G", "GG", "XG", "XXG")


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

    # A camiseta é opcional: modelo e tamanho só são obrigatórios
    # para quem marcou o checkbox de aceite da camiseta.
    if (form.get("aceite_camiseta") or "").strip() == "sim":

        if not (form.get("modelo_camiseta") or "").strip():
            erros.append("Selecione o modelo de camiseta.")

        if not (form.get("tamanho_camiseta") or "").strip():
            erros.append("Selecione o tamanho de camiseta.")

    # Campos "extras" condicionais: se marcou "sim", a descrição não pode
    # ficar vazia.
    if (form.get("alergia") or "").strip() == "sim" and not (form.get("descricao_alergia") or "").strip():
        erros.append("Descreva sua alergia alimentar.")

    if (form.get("remedio") or "").strip() == "sim" and not (form.get("nome_medicamento") or "").strip():
        erros.append("Informe o(s) medicamento(s) que utiliza.")

    if (form.get("necessidade") or "").strip() == "sim" and not (form.get("descricao_necessidade") or "").strip():
        erros.append("Descreva a necessidade, limitação ou informação importante.")

    # Carona só é obrigatória para quem disse que vai com transporte próprio
    if (form.get("transporte") or "").strip() == "proprio" and not (form.get("carona") or "").strip():
        erros.append("Informe se há possibilidade de dar carona para quem necessitar.")

    return erros


# ══════════════════════════════════════════════════════════════════
# PLANILHA DE INSCRIÇÕES — ESTRUTURA DAS COLUNAS
# ══════════════════════════════════════════════════════════════════
# A ordem tem que bater EXATAMENTE com o planilha.append_row(...) da
# rota /enviar. Colunas (A=1 ...):
#   1 nome            2 telefone         3 email           4 data_nascimento
#   5 aceite_camiseta 6 modelo_camiseta  7 tamanho_camiseta
#   8 nome_responsavel 9 grau_parentesco 10 telefone_responsavel
#   11 retiro_ant 12 expectativa 13 chamou_ret 14 ansiedade
#   15 carne_sex 16 alergia 17 descricao_alergia 18 remedio
#   19 nome_medicamento 20 necessidade 21 descricao_necessidade
#   22 transporte 23 carona 24 forma_pagamento 25 valor_total
#   26 direito_de_imag 27 link_foto 28 link_cracha
#   29 data_inscricao 30 status
COLUNAS_INSCRICAO = 29  # colunas de dados lidas (1–29); a 30 é o status
COL_VALOR_TOTAL = 25
COL_STATUS = 30

# Campo editável (nome usado pelo front) → número da coluna na planilha.
COLUNAS_EDITAVEIS = {
    "nome": 1, "telefone": 2, "email": 3, "data_nascimento": 4,
    "aceite_camiseta": 5, "modelo_camiseta": 6, "tamanho_camiseta": 7,
    "nome_responsavel": 8, "grau_parentesco": 9, "telefone_responsavel": 10,
    "retiro_ant": 11, "expectativa": 12, "chamou_ret": 13, "ansiedade": 14,
    "carne_sex": 15, "alergia": 16, "descricao_alergia": 17,
    "remedio": 18, "nome_medicamento": 19,
    "necessidade": 20, "descricao_necessidade": 21,
    "transporte": 22, "carona": 23,
    "forma_pagamento": 24,
    "direito_de_imag": 26,
}


def _status_da_linha(linha):
    """
    Status da inscrição (coluna 30). Inscrições antigas sem status
    são consideradas ATIVAS.
    """
    if len(linha) > 29 and linha[29].strip():
        return linha[29].strip().upper()
    return "ATIVA"


def contar_inscritos(planilha):
    """
    Conta somente as inscrições válidas.
    Inscrições com status 'DUPLICADA' ou 'CANCELADA' não ocupam vaga.
    """

    linhas = planilha.get_all_values()

    if len(linhas) <= 1:
        return 0

    total = 0

    for linha in linhas[1:]:
        # Ignora linhas sem nome
        if not linha or not linha[0].strip():
            continue

        if _status_da_linha(linha) not in ("DUPLICADA", "CANCELADA"):
            total += 1

    return total


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
# DASHBOARD DA COORDENAÇÃO — LEITURA DOS PARTICIPANTES
# ══════════════════════════════════════════════════════════════════

def _parse_valor(bruto):
    """
    Converte o valor lido da planilha ('50', '50.5', '50,5', 'R$ 1.250,00')
    em float. Aceita tanto planilha em formato pt-BR quanto en-US.
    """
    texto = str(bruto or "").replace("R$", "").strip()

    if not texto:
        return 0.0

    if "," in texto:
        # formato brasileiro: ponto = milhar, vírgula = decimal
        texto = texto.replace(".", "").replace(",", ".")

    try:
        return float(texto)
    except ValueError:
        return 0.0


def _pagamentos_por_participante():
    """
    Lê a aba 'pagamentos' e agrupa os lançamentos por participante_id.
    Se a aba ainda não existir ou estiver vazia, devolve um dict vazio
    em vez de derrubar o carregamento do dashboard.
    """

    agrupado = {}

    try:
        aba = get_aba_pagamentos()

        # Colunas: A participante_id | B data | C valor | D obs | E registrado_em
        # Lido por posição para que o nº da linha seja exato: ele vira o "id"
        # do lançamento e é usado para excluí-lo.
        linhas = aba.get_all_values()

        for numero_linha, linha in enumerate(linhas[1:], start=2):

            linha = linha + [""] * (5 - len(linha))

            try:
                pid = int(str(linha[0]).strip())
            except (TypeError, ValueError):
                continue

            agrupado.setdefault(pid, []).append({
                "id": numero_linha,
                "data": parse_date(str(linha[1])),
                "valor": _parse_valor(linha[2]),
                "obs": str(linha[3] or ""),
            })

    except Exception as exc:
        print(f"[AVISO PAGAMENTOS] {exc}")

    return agrupado


def carregar_participantes(incluir_inativos=False):
    """
    Lê a aba principal (inscrições) linha a linha e monta a lista de
    participantes no formato que o dashboard espera, já com o histórico
    de pagamentos de cada um.

    incluir_inativos=False (padrão): esconde DUPLICADA/CANCELADA (view
    "Inscritos"). incluir_inativos=True: devolve todos, com o campo
    "status" (view "Editar dados", para poder reativar).

    O "id" de cada participante é o número da linha na planilha — por
    isso nunca apague linhas; cancele pelo dashboard.
    """

    planilha = get_planilha()

    linhas = planilha.get_all_values()

    if len(linhas) <= 1:
        return []

    pagamentos = _pagamentos_por_participante()

    participantes = []

    # linhas[0] é o cabeçalho; a linha real i (2, 3, 4...) vira o "id"
    for i, linha in enumerate(linhas[1:], start=2):

        # Protege contra linhas mais curtas
        if len(linha) < COLUNAS_INSCRICAO:
            linha = linha + [""] * (COLUNAS_INSCRICAO - len(linha))

        if not linha[0].strip():
            continue  # linha em branco no meio da planilha

        status = _status_da_linha(linha)

        if status in ("DUPLICADA", "CANCELADA") and not incluir_inativos:
            continue

        # Inscrições antigas (sem valor_total gravado) caem no valor cheio.
        try:
            valor_total = float(linha[24]) if linha[24].strip() else VALOR_RETIRO
        except ValueError:
            valor_total = VALOR_RETIRO

        participante = {
            "id": i,
            "status": status,
            "nome": linha[0],
            "telefone": linha[1],
            "email": linha[2],
            "data_nascimento": parse_date(linha[3]),

            "aceite_camiseta": linha[4],
            "modelo_camiseta": linha[5],
            "tamanho_camiseta": linha[6],

            "responsavel": {
                "nome": linha[7],
                "parentesco": linha[8],
                "telefone": linha[9],
            },

            "retiro_ant": linha[10],
            "expectativa": linha[11],
            "chamou_ret": linha[12],
            "ansiedade": linha[13],

            "saude": {
                "carne_sex": linha[14],
                "alergia": linha[15],
                "descricao_alergia": linha[16],
                "remedio": linha[17],
                "nome_medicamento": linha[18],
                "necessidade": linha[19],
                "descricao_necessidade": linha[20],
            },

            "transporte": {
                "tipo": linha[21],
                "carona": linha[22] or None,
            },

            "pagamento": {
                "forma": linha[23],
                "valor_total": valor_total,
                "historico": pagamentos.get(i, []),
            },

            "direito_de_imag": linha[25],
            "link_foto": linha[26],
            "link_cracha": linha[27],
            "data_inscricao": linha[28] or None,
        }

        participantes.append(participante)

    return participantes


def login_requerido(view_func):
    """Protege rotas do /admin: exige sessão de coordenador ativa."""

    @wraps(view_func)
    def wrapper(*args, **kwargs):

        if not flask.session.get("coordenador_logado"):

            # Rotas de API devolvem 401 em JSON (o front trata e redireciona);
            # páginas normais redirecionam direto para o login.
            if flask.request.path.startswith("/admin/api/"):
                return flask.jsonify({"erro": "Sessão expirada. Faça login novamente."}), 401

            return flask.redirect(flask.url_for("admin_login_page"))

        return view_func(*args, **kwargs)

    return wrapper


# ══════════════════════════════════════════════════════════════════
# FLASK
# ══════════════════════════════════════════════════════════════════
app = flask.Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

# Necessário para as sessões de login da coordenação (flask.session).
# Em produção, defina SECRET_KEY nas variáveis de ambiente com um valor
# aleatório e fixo — se ele mudar, todo mundo é deslogado.
app.secret_key = os.environ.get("SECRET_KEY", "chave-de-desenvolvimento-trocar-em-producao")


# ══════════════════════════════════════════════════════════════════
# ROTAS PÚBLICAS
# ══════════════════════════════════════════════════════════════════

@app.errorhandler(RequestEntityTooLarge)
def erro_arquivo_grande(e):
    """
    Se o arquivo enviado (geralmente a foto) ultrapassar o MAX_CONTENT_LENGTH,
    mostra uma mensagem amigável. Rotas /admin/api/ recebem JSON.
    """

    if flask.request.path.startswith("/admin/api/"):
        return flask.jsonify({"erro": "A foto é muito grande (máximo 20 MB)."}), 413

    return flask.render_template(
        "formulario.html",
        erro="A foto enviada é muito grande. Tente novamente com uma foto menor, "
             "ou tire um print/captura de tela dela antes de enviar."
    ), 413


@app.route("/")
def home():

    try:
        planilha = get_planilha()
        vagas_esgotadas = contar_inscritos(planilha) >= VAGAS_TOTAL
    except Exception as exc:
        # Se não conseguir checar a planilha agora, mostra a home normalmente
        # — a checagem definitiva acontece de novo no /formulario e no /enviar.
        print(f"[AVISO VAGAS] {exc}")
        vagas_esgotadas = False

    return flask.render_template("index.html", vagas_esgotadas=vagas_esgotadas)


@app.route("/formulario")
def formulario():

    try:
        planilha = get_planilha()
        vagas_esgotadas = contar_inscritos(planilha) >= VAGAS_TOTAL
    except Exception as exc:
        print(f"[AVISO VAGAS] {exc}")
        vagas_esgotadas = False

    return flask.render_template("formulario.html", vagas_esgotadas=vagas_esgotadas)


@app.route("/agenda")
def agenda():
    return flask.render_template("agenda.html")


@app.route("/api/events")
def api_events():
    try:
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


# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO — LOGIN
# ══════════════════════════════════════════════════════════════════

@app.route("/admin")
def admin_login_page():
    """Tela de login. Se já estiver logado, pula direto pro dashboard."""
    if flask.session.get("coordenador_logado"):
        return flask.redirect(flask.url_for("admin_dashboard"))
    return flask.render_template("login.html")


@app.route("/admin/login", methods=["POST"])
def admin_login():
    """Valida e-mail/senha da coordenação e abre a sessão."""

    dados = flask.request.get_json(silent=True) or flask.request.form

    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""

    if not ADMIN_EMAIL or not ADMIN_SENHA_HASH:
        return flask.jsonify({
            "erro": "Login da coordenação ainda não foi configurado no servidor."
        }), 500

    if email != ADMIN_EMAIL.strip().lower() or not check_password_hash(ADMIN_SENHA_HASH, senha):
        return flask.jsonify({"erro": "E-mail ou senha inválidos."}), 401

    flask.session["coordenador_logado"] = True
    flask.session["coordenador_email"] = email

    return flask.jsonify({"ok": True, "redirect": flask.url_for("admin_dashboard")})


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    flask.session.clear()
    return flask.jsonify({"ok": True, "redirect": flask.url_for("admin_login_page")})


@app.route("/admin/dashboard")
@login_requerido
def admin_dashboard():
    return flask.render_template("dashboard.html")


# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO — PARTICIPANTES
# ══════════════════════════════════════════════════════════════════

@app.route("/admin/api/participantes")
@login_requerido
def admin_api_participantes():
    """?todos=1 inclui canceladas/duplicadas (usado na aba 'Editar dados')."""

    incluir_inativos = flask.request.args.get("todos") == "1"

    try:
        return flask.jsonify(carregar_participantes(incluir_inativos=incluir_inativos))
    except Exception as exc:
        print(f"[ERRO API PARTICIPANTES] {exc}")
        return flask.jsonify({"erro": "Não foi possível carregar os participantes agora."}), 500


@app.route("/admin/api/participantes/<int:participante_id>", methods=["PUT"])
@login_requerido
def admin_api_editar_participante(participante_id):
    """Edita os dados de um inscrito direto na planilha (id = nº da linha)."""

    if participante_id < 2:
        return flask.jsonify({"erro": "Inscrito inválido."}), 400

    dados = flask.request.get_json(silent=True) or {}

    novos = {}
    for campo in COLUNAS_EDITAVEIS:
        if campo in dados:
            novos[campo] = str(dados[campo] if dados[campo] is not None else "").strip()

    # ── validações ──
    if "nome" in novos and not novos["nome"]:
        return flask.jsonify({"erro": "O nome não pode ficar vazio."}), 400

    if "email" in novos and not EMAIL_REGEX.match(novos["email"]):
        return flask.jsonify({"erro": "Informe um e-mail válido."}), 400

    if "data_nascimento" in novos and not re.match(r"^\d{4}-\d{2}-\d{2}$", novos["data_nascimento"]):
        return flask.jsonify({"erro": "Informe uma data de nascimento válida."}), 400

    # ── camiseta: limpa modelo/tamanho se não aceitou; recalcula o valor ──
    if "aceite_camiseta" in novos:

        if novos["aceite_camiseta"] == "sim":
            if novos.get("modelo_camiseta") not in ("masculino", "feminino"):
                return flask.jsonify({"erro": "Selecione o modelo de camiseta."}), 400
            if novos.get("tamanho_camiseta") not in TAMANHOS_VALIDOS:
                return flask.jsonify({"erro": "Selecione o tamanho de camiseta."}), 400
        else:
            novos["aceite_camiseta"] = ""
            novos["modelo_camiseta"] = ""
            novos["tamanho_camiseta"] = ""

    # ── descrições condicionais: exige se "sim", limpa se não ──
    for pergunta, descricao in (("alergia", "descricao_alergia"),
                                ("remedio", "nome_medicamento"),
                                ("necessidade", "descricao_necessidade")):
        if novos.get(pergunta) == "sim":
            if not novos.get(descricao):
                return flask.jsonify({
                    "erro": "Preencha a descrição dos itens de saúde marcados como \"Sim\"."
                }), 400
        elif pergunta in novos:
            novos[descricao] = ""

    try:
        planilha = get_planilha()

        # Confere que a linha existe e tem alguém
        if not planilha.cell(participante_id, 1).value:
            return flask.jsonify({"erro": "Inscrito não encontrado."}), 404

        atualizacoes = [
            {"range": rowcol_to_a1(participante_id, COLUNAS_EDITAVEIS[campo]), "values": [[valor]]}
            for campo, valor in novos.items()
        ]

        if "aceite_camiseta" in novos:
            valor_total = VALOR_RETIRO + (VALOR_CAMISETA if novos["aceite_camiseta"] == "sim" else 0)
            atualizacoes.append({
                "range": rowcol_to_a1(participante_id, COL_VALOR_TOTAL),
                "values": [[valor_total]]
            })

        # RAW: grava exatamente o texto digitado (evita "+55..." virar fórmula)
        planilha.batch_update(atualizacoes, value_input_option="RAW")

    except Exception as exc:
        print(f"[ERRO EDITAR PARTICIPANTE] {exc}")
        return flask.jsonify({"erro": "Não foi possível salvar na planilha agora."}), 500

    return flask.jsonify({"ok": True})


@app.route("/admin/api/participantes/<int:participante_id>/status", methods=["POST"])
@login_requerido
def admin_api_status_participante(participante_id):
    """Cancela (CANCELADA) ou reativa (ATIVA) uma inscrição. Não apaga a linha."""

    if participante_id < 2:
        return flask.jsonify({"erro": "Inscrito inválido."}), 400

    dados = flask.request.get_json(silent=True) or {}
    novo = (dados.get("status") or "").strip().upper()

    if novo not in ("ATIVA", "CANCELADA"):
        return flask.jsonify({"erro": "Situação inválida."}), 400

    try:
        planilha = get_planilha()

        if not planilha.cell(participante_id, 1).value:
            return flask.jsonify({"erro": "Inscrito não encontrado."}), 404

        if novo == "ATIVA" and contar_inscritos(planilha) >= VAGAS_TOTAL:
            return flask.jsonify({"erro": "Não há vagas livres para reativar esta inscrição."}), 409

        planilha.update_cell(participante_id, COL_STATUS, novo)

    except Exception as exc:
        print(f"[ERRO STATUS PARTICIPANTE] {exc}")
        return flask.jsonify({"erro": "Não foi possível atualizar a planilha agora."}), 500

    return flask.jsonify({"ok": True})


@app.route("/admin/api/participantes/<int:participante_id>/pagamentos", methods=["POST"])
@login_requerido
def admin_api_add_pagamento(participante_id):

    dados = flask.request.get_json(silent=True) or {}

    try:
        valor = float(dados.get("valor"))
    except (TypeError, ValueError):
        return flask.jsonify({"erro": "Informe um valor válido."}), 400

    if valor <= 0:
        return flask.jsonify({"erro": "O valor precisa ser maior que zero."}), 400

    data = (dados.get("data") or "").strip() or datetime.now().strftime("%Y-%m-%d")
    obs = (dados.get("obs") or "").strip()

    try:
        aba_pagamentos = get_aba_pagamentos()
        aba_pagamentos.append_row(
            [participante_id, data, valor, obs, datetime.now().isoformat()],
            value_input_option="USER_ENTERED"
        )
    except Exception as exc:
        print(f"[ERRO GRAVAR PAGAMENTO] {exc}")
        return flask.jsonify({"erro": "Não foi possível salvar o pagamento agora."}), 500

    return flask.jsonify({"ok": True})


@app.route("/admin/api/participantes/<int:participante_id>/pagamentos/<int:linha>", methods=["DELETE"])
@login_requerido
def admin_api_remover_pagamento(participante_id, linha):
    """
    Exclui um lançamento da aba 'pagamentos' (linha = nº da linha na aba).

    Antes de apagar, confere se a linha ainda pertence a esse participante e
    tem o mesmo valor que a tela mostrava. Como apagar uma linha desloca as
    de baixo, isso evita remover o lançamento errado se a aba tiver mudado
    desde que o dashboard foi carregado.
    """

    if linha < 2:
        return flask.jsonify({"erro": "Lançamento inválido."}), 400

    dados = flask.request.get_json(silent=True) or {}

    try:
        aba = get_aba_pagamentos()

        valores = aba.row_values(linha)
        valores = valores + [""] * (5 - len(valores))

        if str(valores[0]).strip() != str(participante_id):
            return flask.jsonify({
                "erro": "Esse lançamento mudou na planilha. Recarregue a lista e tente novamente."
            }), 409

        if dados.get("valor") is not None:
            try:
                esperado = float(dados["valor"])
            except (TypeError, ValueError):
                return flask.jsonify({"erro": "Valor inválido."}), 400

            if abs(_parse_valor(valores[2]) - esperado) > 0.001:
                return flask.jsonify({
                    "erro": "Esse lançamento mudou na planilha. Recarregue a lista e tente novamente."
                }), 409

        aba.delete_rows(linha)

    except Exception as exc:
        print(f"[ERRO REMOVER PAGAMENTO] {exc}")
        return flask.jsonify({"erro": "Não foi possível excluir o lançamento agora."}), 500

    return flask.jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO — CRACHÁ AVULSO
# ══════════════════════════════════════════════════════════════════

@app.route("/admin/api/cracha", methods=["POST"])
@login_requerido
def admin_api_cracha():
    """
    Gera um crachá avulso (músicos, pregadores, convidados). Prévia e
    download usam o mesmo PNG. Não grava nada na planilha nem no Cloudinary.
    """

    nome = (flask.request.form.get("nome") or "").strip()
    foto = flask.request.files.get("foto")

    if not nome:
        return flask.jsonify({"erro": "Informe o nome."}), 400

    if len(nome) > 60:
        return flask.jsonify({"erro": "Nome muito longo (máximo 60 caracteres)."}), 400

    if not foto or not foto.filename:
        return flask.jsonify({"erro": "Envie uma foto."}), 400

    try:
        foto_normalizada = normalizar_foto(foto)
        buffer = gerar_cracha(nome, foto_normalizada)
    except Exception as exc:
        print(f"[ERRO CRACHA AVULSO] {exc}")
        return flask.jsonify({"erro": "Não foi possível processar essa foto. Tente outra."}), 400

    resposta = flask.send_file(buffer, mimetype="image/png")
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


# ══════════════════════════════════════════════════════════════════
# INSCRIÇÃO (FORMULÁRIO PÚBLICO)
# ══════════════════════════════════════════════════════════════════

@app.route("/enviar", methods=["POST"])
def enviar():

    # Guardado para virar a coluna "data_inscricao" (ordenação no dashboard).
    data_hora_inscricao = datetime.now().isoformat()

    # ══════════════════════════════════════════════════════════════
    # VALIDAÇÃO SERVER-SIDE
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
    # LIMITE DE VAGAS
    # ══════════════════════════════════════════════════════════════
    if contar_inscritos(planilha) >= VAGAS_TOTAL:
        return flask.render_template(
            "formulario.html",
            vagas_esgotadas=True
        ), 400

    def campo(nome_campo):
        return flask.request.form.get(nome_campo, "").strip()

    # Dados pessoais
    nome = campo("nome")
    telefone = campo("telefone")
    email = campo("email")
    data_nascimento = campo("data_nascimento")

    # Camiseta ("sim" quando marcado, "" quando desmarcado)
    aceite_camiseta = campo("aceite_camiseta")
    modelo_camiseta = campo("modelo_camiseta")
    tamanho_camiseta = campo("tamanho_camiseta")

    # Responsável
    nome_responsavel = campo("nome_responsavel")
    grau_parentesco = campo("grau_parentesco")
    telefone_responsavel = campo("telefone_responsavel")

    # Sobre você
    retiro_ant = campo("retiro_ant")
    expectativa = campo("expectativa")
    chamou_ret = campo("chamou_ret")
    ansiedade = campo("ansiedade")

    # Saúde
    carne_sex = campo("carne_sex")
    alergia = campo("alergia")
    descricao_alergia = campo("descricao_alergia")
    remedio = campo("remedio")
    nome_medicamento = campo("nome_medicamento")
    necessidade = campo("necessidade")
    descricao_necessidade = campo("descricao_necessidade")

    # Transporte ("carona" só existe quando transporte = "proprio")
    transporte = campo("transporte")
    carona = campo("carona")

    # Pagamento: soma o adicional da camiseta apenas para quem aceitou.
    forma_pagamento = campo("forma_pagamento")
    valor_total = VALOR_RETIRO + (VALOR_CAMISETA if aceite_camiseta == "sim" else 0)

    # Imagem / foto
    direito_de_imag = campo("direito_de_imag")

    link_foto = ""
    link_cracha = ""

    foto = flask.request.files.get("foto_participante")

    if foto and foto.filename:

        try:

            # 1) Normaliza a foto (HEIC/HEIF/PNG/WEBP → JPEG)
            foto_normalizada = normalizar_foto(foto)

            # 2) Gera o crachá a partir da foto já normalizada
            foto_normalizada.seek(0)
            buffer_cracha = gerar_cracha(nome, foto_normalizada)

            # 3) Upload da foto (já normalizada) no Cloudinary
            foto_normalizada.seek(0)
            resultado_foto = cloudinary.uploader.upload(
                foto_normalizada,
                folder="fotos_participantes",
                format="jpg"
            )

            link_foto = resultado_foto["secure_url"]

            # 4) Upload do crachá gerado no Cloudinary
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

            # Interrompe a inscrição em vez de gravar dados incompletos.
            return flask.render_template(
                "formulario.html",
                erro="Não foi possível processar sua foto agora. "
                     "Tente novamente com outra foto ou tente novamente "
                     "em alguns instantes."
            ), 500

    # ══════════════════════════════════════════════════════════════
    # SALVAR NA PLANILHA
    # (sem prints com dados pessoais dos inscritos nos logs)
    #
    # IMPORTANTE: a ordem abaixo precisa bater com a ordem das colunas
    # documentada acima (e com COLUNAS_EDITAVEIS).
    # ══════════════════════════════════════════════════════════════
    planilha.append_row([

        nome,
        telefone,
        email,
        data_nascimento,

        aceite_camiseta,
        modelo_camiseta,
        tamanho_camiseta,

        nome_responsavel,
        grau_parentesco,
        telefone_responsavel,

        retiro_ant,
        expectativa,
        chamou_ret,
        ansiedade,

        carne_sex,
        alergia,
        descricao_alergia,
        remedio,
        nome_medicamento,
        necessidade,
        descricao_necessidade,

        transporte,
        carona,

        forma_pagamento,
        valor_total,

        direito_de_imag,
        link_foto,
        link_cracha,

        data_hora_inscricao,

        "ATIVA"

    ], value_input_option="USER_ENTERED")

    return flask.render_template(
        "formulario.html",
        sucesso=True,
        nome=nome,
        valor_total=valor_total
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
