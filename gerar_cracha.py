from PIL import Image, ImageDraw, ImageFont, ImageOps
from io import BytesIO
from pillow_heif import register_heif_opener

register_heif_opener()

def gerar_cracha(nome, foto_file):

    # ==================================================
    # BAIXAR FOTO
    # ==================================================
    foto_file.seek(0)

    foto = Image.open(foto_file)

    # Corrige automaticamente a orientação da foto
    foto = ImageOps.exif_transpose(foto)

    foto = foto.convert("RGBA")

    # ==================================================
    # TEMPLATE
    # ==================================================
    base = Image.open(
        "modelos/cracha_em_branco_VII_Desperta.png"
    ).convert("RGBA")

    # ==================================================
    # FOTO CIRCULAR
    # ==================================================

    diametro = 254

    foto = ImageOps.fit(
        foto,
        (diametro, diametro),
        Image.Resampling.LANCZOS
    )

    mascara = Image.new(
        "L",
        (diametro, diametro),
        0
    )

    draw_mascara = ImageDraw.Draw(mascara)

    draw_mascara.ellipse(
        (0, 0, diametro, diametro),
        fill=255
    )

    foto.putalpha(mascara)

    # ==================================================
    # CENTRO DO CÍRCULO DO TEMPLATE
    # ==================================================
    # AJUSTE FINO AQUI SE NECESSÁRIO

    # Valor muito baixo foto para esquerda, valor muito alto foto para direita
    centro_x = 632

    #Valor muito baixo foto para cima, valor muito alto foto para baixo
    centro_y = 214

    pos_x = int(centro_x - diametro / 2)
    pos_y = int(centro_y - diametro / 2)

    base.paste(
        foto,
        (pos_x, pos_y),
        foto
    )

    # ==================================================
    # TEXTO
    # ==================================================

    draw = ImageDraw.Draw(base)

    # TAMANHO AUTOMÁTICO
    if len(nome) > 30:
        tamanho_fonte = 42
    elif len(nome) > 20:
        tamanho_fonte = 50
    else:
        tamanho_fonte = 68

    # ==========================================
    # ALTERAR FONTE AQUI
    # ==========================================

    fonte = ImageFont.truetype(
        "modelos/GoogleSansFlex_72pt-Black.ttf",
        tamanho_fonte
    )

    # ==========================================
    # ALTERAR COR AQUI
    # ==========================================

    cor_nome = (0, 0, 0)

    # ==========================================
    # MEDIDAS DO TEXTO
    # ==========================================

    bbox = draw.textbbox(
        (0, 0),
        nome,
        font=fonte
    )

    largura_texto = bbox[2] - bbox[0]
    altura_texto = bbox[3] - bbox[1]

    # ==================================================
    # FAIXA BRANCA
    # ==================================================

    faixa_x = 35
    faixa_y = 930

    faixa_largura = 730
    faixa_altura = 120

    centro_faixa_x = faixa_x + (faixa_largura / 2)
    centro_faixa_y = faixa_y + (faixa_altura / 2)

    x_texto = centro_faixa_x - (largura_texto / 2)

    y_texto = centro_faixa_y - (altura_texto / 2) - 15

    draw.text(
        (x_texto, y_texto),
        nome,
        fill=cor_nome,
        font=fonte
    )

    # ==================================================
    # GERAR IMAGEM EM MEMÓRIA
    # ==================================================

    buffer = BytesIO()

    base.save(
        buffer,
        format="PNG"
    )

    buffer.seek(0)

    # ==================================================
    # UPLOAD CLOUDINARY
    # ==================================================

    buffer.seek(0)

    return buffer
