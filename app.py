import flask
import os
import gspread
from google.oauth2.service_account import Credentials

import cloudinary
import cloudinary.uploader

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
NOME_PLANILHA = "VII Desperta"

# ══════════════════════════════════════════════════════════════════
# GOOGLE SHEETS
# ══════════════════════════════════════════════════════════════════
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

creds = Credentials.from_service_account_file(
    "credenciais.json",
    scopes=SCOPES
)

cliente_sheet = gspread.authorize(creds)

planilha = cliente_sheet.open(NOME_PLANILHA).sheet1

# ══════════════════════════════════════════════════════════════════
# FLASK
# ══════════════════════════════════════════════════════════════════
app = flask.Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# ══════════════════════════════════════════════════════════════════
# ROTAS
# ══════════════════════════════════════════════════════════════════

@app.route("/")
def home():
    return flask.render_template("index.html")


@app.route("/formulario")
def formulario():
    return flask.render_template("formulario.html")


@app.route("/enviar", methods=["POST"])
def enviar():

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
            resultado = cloudinary.uploader.upload(foto)

            link_foto = resultado["secure_url"]

            # GERAR CRACHÁ AUTOMÁTICO
            link_cracha = gerar_cracha(
                nome,
                link_foto
            )

        except Exception as e:

            print(f"[ERRO CLOUDINARY] {e}")

            link_foto = f"Erro: {e}"
            link_cracha = f"Erro: {e}"

    # ══════════════════════════════════════════════════════════════
    # SALVAR NA PLANILHA
    # ══════════════════════════════════════════════════════════════
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
