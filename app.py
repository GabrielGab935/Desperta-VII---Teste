import flask
import os
import re
import json
from datetime import datetime
from io import BytesIO
from functools import wraps

from werkzeug.security import check_password_hash

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

# Aba onde cada pagamento registrado pela coordenação é gravado (uma linha
# por pagamento). É criada automaticamente na primeira vez que for usada.
NOME_ABA_PAGAMENTOS = os.environ.get("SHEET_NAME_PAGAMENTOS", "pagamentos")

# Valor total do retiro (usado para calcular "pago / parcial / pendente").
# A planilha de inscrições não guarda esse valor, então ele vem de config.
VALOR_RETIRO = float(os.environ.get("VALOR_RETIRO", "100.00"))

# Valor extra cobrado de quem optar por adquirir a camiseta do evento.
VALOR_CAMISETA = float(os.environ.get("VALOR_CAMISETA", "50.00"))

# Número máximo de inscrições aceitas para esta edição do retiro.
# Para abrir mais vagas no futuro (ex.: alguém desistiu, ou a coordenação
# decidiu aumentar o limite), basta mudar essa variável de ambiente e
# reiniciar o servidor — não precisa alterar o código.
VAGAS_TOTAL = int(os.environ.get("VAGAS_TOTAL", "80"))

# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO (login/admin)
# ══════════════════════════════════════════════════════════════════
# ADMIN_EMAIL: e-mail de acesso da coordenação.
# ADMIN_SENHA_HASH: gerado uma vez com:
#   python3 -c "from werkzeug.security import generate_password_hash as g; print(g('sua_senha_aqui'))"
# e colado como variável de ambiente (nunca a senha em texto puro).
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

    # A camiseta agora é opcional: modelo e tamanho só são obrigatórios
    # para quem marcou o checkbox de aceite da camiseta (+ R$ 50,00).
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


def contar_inscritos(planilha):
    """
    Conta quantas inscrições já existem na planilha (linhas com nome
    preenchido, ignorando o cabeçalho e linhas em branco no meio).
    """

    linhas = planilha.get_all_values()

    if len(linhas) <= 1:
        return 0

    return sum(1 for linha in linhas[1:] if linha and linha[0].strip())


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
# A ordem abaixo tem que bater EXATAMENTE com a ordem das colunas usada
# em planilha.append_row(...) na rota /enviar, mais a coluna extra
# "data_inscricao" adicionada ao final (ver comentário lá).
COLUNAS_INSCRICAO = 29  # 28 campos do formulário + 1 de timestamp


def _pagamentos_por_participante():
    """
    Lê a aba 'pagamentos' e agrupa os lançamentos por participante_id.
    Se a aba ainda não existir ou estiver vazia, devolve um dict vazio
    em vez de derrubar o carregamento do dashboard.
    """

    agrupado = {}

    try:
        aba = get_aba_pagamentos()
        for registro in aba.get_all_records():

            pid_bruto = registro.get("participante_id")

            try:
                pid = int(pid_bruto)
            except (TypeError, ValueError):
                continue

            try:
                valor = float(registro.get("valor") or 0)
            except (TypeError, ValueError):
                valor = 0.0

            agrupado.setdefault(pid, []).append({
                "data": parse_date(str(registro.get("data", ""))),
                "valor": valor,
                "obs": str(registro.get("obs") or ""),
            })

    except Exception as exc:
        print(f"[AVISO PAGAMENTOS] {exc}")

    return agrupado


def carregar_participantes():
    """
    Lê a aba principal (inscrições) linha a linha e monta a lista de
    participantes no formato que o dashboard (admin.js) espera, já
    com o histórico de pagamentos de cada um.

    Usa get_all_values() (por posição), não get_all_records() (por
    cabeçalho), porque o que garante a ordem das colunas aqui é a
    própria rota /enviar — não depende do texto exato do cabeçalho
    da planilha.
    """

    planilha = get_planilha()

    linhas = planilha.get_all_values()

    if len(linhas) <= 1:
        return []

    pagamentos = _pagamentos_por_participante()

    participantes = []

    # linhas[0] é o cabeçalho; a linha real i (2, 3, 4...) vira o "id"
    for i, linha in enumerate(linhas[1:], start=2):

        # Protege contra linhas mais curtas (ex.: inscrições antigas
        # feitas antes de alguma coluna nova ser adicionada)
        if len(linha) < COLUNAS_INSCRICAO:
            linha = linha + [""] * (COLUNAS_INSCRICAO - len(linha))

        if not linha[0].strip():
            continue  # linha em branco no meio da planilha

        # Inscrições antigas (feitas antes da camiseta virar opcional) não
        # têm valor_total gravado; nesse caso, cai no valor cheio do retiro.
        try:
            valor_total = float(linha[24]) if linha[24].strip() else VALOR_RETIRO
        except ValueError:
            valor_total = VALOR_RETIRO

        participante = {
            "id": i,
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

    try:
        planilha = get_planilha()
        vagas_esgotadas = contar_inscritos(planilha) >= VAGAS_TOTAL
    except Exception as exc:
        # Se não conseguir checar a planilha agora, mostra a home normalmente
        # (com o botão de inscrição) — a checagem definitiva de qualquer forma
        # acontece de novo no /formulario e no /enviar.
        print(f"[AVISO VAGAS] {exc}")
        vagas_esgotadas = False

    return flask.render_template("index.html", vagas_esgotadas=vagas_esgotadas)


@app.route("/formulario")
def formulario():

    try:
        planilha = get_planilha()
        vagas_esgotadas = contar_inscritos(planilha) >= VAGAS_TOTAL
    except Exception as exc:
        # Se não conseguir checar a planilha agora, deixa o formulário
        # abrir normalmente — a checagem definitiva acontece de novo
        # no /enviar antes de gravar a inscrição.
        print(f"[AVISO VAGAS] {exc}")
        vagas_esgotadas = False

    return flask.render_template("formulario.html", vagas_esgotadas=vagas_esgotadas)


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


# ══════════════════════════════════════════════════════════════════
# ÁREA DA COORDENAÇÃO
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


@app.route("/admin/api/participantes")
@login_requerido
def admin_api_participantes():
    try:
        return flask.jsonify(carregar_participantes())
    except Exception as exc:
        print(f"[ERRO API PARTICIPANTES] {exc}")
        return flask.jsonify({"erro": "Não foi possível carregar os participantes agora."}), 500


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


@app.route("/enviar", methods=["POST"])
def enviar():

    # ══════════════════════════════════════════════════════════════
    # VALIDAÇÃO SERVER-SIDE
    # (o JS do formulário já valida no navegador, mas nunca confiamos
    # só nisso: se o JS falhar ou for pulado, o servidor barra aqui)
    # ══════════════════════════════════════════════════════════════
    # Guardado para virar a última coluna da planilha (usado pelo dashboard
    # da coordenação pra ordenar por "últimos/primeiros inscritos").
    data_hora_inscricao = datetime.now().isoformat()

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
    # Checado aqui, antes de processar foto/crachá, para não gastar
    # tempo/processamento numa inscrição que não poderá ser aceita.
    # ══════════════════════════════════════════════════════════════
    if contar_inscritos(planilha) >= VAGAS_TOTAL:
        return flask.render_template(
            "formulario.html",
            vagas_esgotadas=True
        ), 400

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
    # CAMISETA
    # ══════════════════════════════════════════════════════════════
    aceite_camiseta = flask.request.form.get(
        "aceite_camiseta",
        ""
    ).strip()  # "sim" quando marcado, "" quando desmarcado

    modelo_camiseta = flask.request.form.get(
        "modelo_camiseta",
        ""
    ).strip()

    tamanho_camiseta = flask.request.form.get(
        "tamanho_camiseta",
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

    chamou_ret = flask.request.form.get(
        "chamou_ret",
        ""
    ).strip()

    ansiedade = flask.request.form.get(
        "ansiedade",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # SAÚDE
    # ══════════════════════════════════════════════════════════════
    carne_sex = flask.request.form.get(
        "carne_sex",
        ""
    ).strip()

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

    necessidade = flask.request.form.get(
        "necessidade",
        ""
    ).strip()

    descricao_necessidade = flask.request.form.get(
        "descricao_necessidade",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # TRANSPORTE
    # ══════════════════════════════════════════════════════════════
    transporte = flask.request.form.get(
        "transporte",
        ""
    ).strip()

    # Só existe quando "transporte" = "proprio" (campo condicional no form)
    carona = flask.request.form.get(
        "carona",
        ""
    ).strip()

    # ══════════════════════════════════════════════════════════════
    # PAGAMENTO
    # ══════════════════════════════════════════════════════════════
    forma_pagamento = flask.request.form.get(
        "forma_pagamento",
        ""
    ).strip()

    # Valor final da inscrição: soma o adicional da camiseta apenas
    # para quem marcou o checkbox de aceite.
    valor_total = VALOR_RETIRO + (VALOR_CAMISETA if aceite_camiseta == "sim" else 0)

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
    #
    # IMPORTANTE: a ordem abaixo precisa bater exatamente com a ordem
    # das colunas na planilha "VII Desperta" (aba de inscrições).
    # Se você reordenar algo aqui, reordene a mesma coluna na planilha.

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

        data_hora_inscricao

    ], value_input_option="USER_ENTERED")

    # ══════════════════════════════════════════════════════════════
    # RETORNO
    # ══════════════════════════════════════════════════════════════
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
