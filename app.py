import flask
import os
import re
import json
from datetime import datetime

import gspread
from google.oauth2.service_account import Credentials

import cloudinary
import cloudinary.uploader

from flask import jsonify

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

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Permite que a agenda.html chame /api/events mesmo se estiver em outro domínio


# ══════════════════════════════════════════════════════════════════
# ROTAS
# ══════════════════════════════════════════════════════════════════

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
        
        todas = cliente_sheet.openall()
        nomes = [p.title for p in todas]
        
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

    planilha = get_planilha()

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

    foto = flask.request.files.get("foto_participante")

    if foto and foto.filename:

        try:

            # UPLOAD DA FOTO
            # Gera o crachá em memória
            buffer_cracha = gerar_cracha(
                nome,
                foto
            )

            # Volta o ponteiro da foto
            foto.seek(0)

            # Upload da foto original
            resultado_foto = cloudinary.uploader.upload(
                foto,
                folder="fotos_participantes"
            )

            link_foto = resultado_foto["secure_url"]

            # Upload do crachá
            resultado_cracha = cloudinary.uploader.upload(
                buffer_cracha,
                folder="crachas_desperta",
                resource_type="image"
            )

            link_cracha = resultado_cracha["secure_url"]

            buffer_cracha.close()

        except Exception as e:

            print(f"[ERRO CLOUDINARY] {e}")

            link_foto = f"Erro: {e}"
            link_cracha = f"Erro: {e}"

    # ══════════════════════════════════════════════════════════════
    # SALVAR NA PLANILHA
    # ══════════════════════════════════════════════════════════════

    print(type(nome), nome)
    print(type(telefone), telefone)
    print(type(email), email)
    print(type(data_nascimento), data_nascimento)
    print(type(nome_responsavel), nome_responsavel)
    print(type(grau_parentesco), grau_parentesco)
    print(type(telefone_responsavel), telefone_responsavel)
    print(type(retiro_ant), retiro_ant)
    print(type(expectativa), expectativa)
    print(type(alergia), alergia)
    print(type(descricao_alergia), descricao_alergia)
    print(type(remedio), remedio)
    print(type(nome_medicamento), nome_medicamento)
    print(type(link_foto), link_foto)
    print(type(link_cracha), link_cracha)

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
