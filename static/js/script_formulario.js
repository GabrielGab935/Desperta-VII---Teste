// Nav menu toggle (hamburger simples)

  const menuBtn = document.querySelector('.nav-menu');
  const drawer = document.querySelector('.nav-drawer');
  const overlay = document.querySelector('.nav-overlay');
  const closeBtn = document.querySelector('.nav-close');

  menuBtn.addEventListener('click', () => {
    drawer.classList.add('active');
    overlay.classList.add('active');
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  });

  overlay.addEventListener('click', () => {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  });
  
/* ─────────────────────────────
     MÁSCARA Data de Nascimento
  ───────────────────────────── */
  function mascaraData(input) {

    // Remove tudo que não for número
    let valor = input.value.replace(/\D/g, '');

    // Limita a 8 números
    valor = valor.substring(0, 8);

     // Dia
    if (valor.length >= 2) {

        let dia = parseInt(valor.substring(0,2));

        if (dia > 31)
            dia = 31;

        valor = dia.toString().padStart(2,"0") + valor.substring(2);
    }

    // Mês
    if (valor.length >= 4){

        let mes = parseInt(valor.substring(2,4));

        if (mes > 12)
            mes = 12;

        valor =
            valor.substring(0,2) +
            mes.toString().padStart(2,"0") +
            valor.substring(4);
    } 

      // Formatação
      if(valor.length > 2)
        valor = valor.replace(/^(\d{2})(\d)/,"$1/$2");

      if(valor.length > 5)
        valor = valor.replace(/^(\d{2})\/(\d{2})(\d)/,"$1/$2/$3");

      input.value = valor;
    }

/* ─────────────────────────────
     Validar Data de Nascimento
  ───────────────────────────── */
  function validarData(data){

    const partes = data.split("/");

    if(partes.length !== 3)
        return false;

    const dia = parseInt(partes[0]);

    const mes = parseInt(partes[1]);

    const ano = parseInt(partes[2]);

    if(ano < 1900 || ano > new Date().getFullYear())
        return false;

    const dataObj = new Date(ano, mes - 1, dia);

    const hoje = new Date();

      if (dataObj > hoje)
          return false;

    return (

        dataObj.getFullYear() === ano &&

        dataObj.getMonth() === mes - 1 &&

        dataObj.getDate() === dia

    );

  }
  

  /* ─────────────────────────────
     MÁSCARA TELEFONE
  ───────────────────────────── */

  function mascaraTel(input) {

    // Remove tudo que não é número
    let valor = input.value.replace(/\D/g, '');

    // Limita a 11 dígitos
    valor = valor.substring(0, 11);

    // Formata (XX) XXXXX-XXXX
    valor = valor.replace(/^(\d{2})(\d)/, '($1) $2');
    valor = valor.replace(/(\d{5})(\d)/, '$1-$2');

    input.value = valor;
  } 

  /* ─────────────────────────────
     MOSTRAR CAMPOS EXTRAS
  ───────────────────────────── */

  function toggleExtra(id, valor) {

    const campo = document.getElementById(id);

    if (valor === 'sim') {
      campo.classList.add('visivel');
    } else {
      campo.classList.remove('visivel');
    }
  }

/* ─────────────────────────────────────────────
   COMPRIMIR FOTO
   Reduz dimensões e qualidade antes do envio.
───────────────────────────────────────────── */

function comprimirFoto(
  file,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.75
) {

  return new Promise((resolve) => {

    const nomeMinusculo =
      (file.name || '').toLowerCase();

    const pareceHeic =
      nomeMinusculo.endsWith('.heic') ||
      nomeMinusculo.endsWith('.heif') ||
      file.type === 'image/heic' ||
      file.type === 'image/heif';


    /* HEIC/HEIF:
       deixa o arquivo original para o Python
       processar com pillow-heif. */

    if (
      !file.type.startsWith('image/') ||
      pareceHeic
    ) {

      if (pareceHeic) {
        console.warn(
          '[comprimirFoto] HEIC/HEIF detectado. ' +
          'Mantendo arquivo original.'
        );
      }

      resolve(file);
      return;
    }


    let resolvido = false;

    const resolverUmaVez = (arquivo) => {

      if (resolvido) return;

      resolvido = true;
      resolve(arquivo);
    };


    /* Timeout de segurança */

    const timeoutId = setTimeout(() => {

      console.warn(
        '[comprimirFoto] Timeout ao processar imagem. ' +
        'Usando arquivo original.'
      );

      resolverUmaVez(file);

    }, 8000);


    try {

      const img = new Image();

      const url =
        URL.createObjectURL(file);


      img.onload = function () {

        try {

          URL.revokeObjectURL(url);


          let largura =
            img.naturalWidth;

          let altura =
            img.naturalHeight;


          /* Mantém a proporção */

          if (
            largura > maxWidth ||
            altura > maxHeight
          ) {

            const escala =
              Math.min(
                maxWidth / largura,
                maxHeight / altura
              );

            largura =
              Math.round(largura * escala);

            altura =
              Math.round(altura * escala);
          }


          /* Canvas */

          const canvas =
            document.createElement('canvas');

          canvas.width = largura;
          canvas.height = altura;


          const ctx =
            canvas.getContext('2d');


          if (!ctx) {

            clearTimeout(timeoutId);

            resolverUmaVez(file);

            return;
          }


          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';


          ctx.drawImage(
            img,
            0,
            0,
            largura,
            altura
          );


          /* Converte para JPEG */

          canvas.toBlob(
            (blob) => {

              clearTimeout(timeoutId);


              if (!blob) {

                console.warn(
                  '[comprimirFoto] ' +
                  'canvas.toBlob retornou vazio.'
                );

                resolverUmaVez(file);

                return;
              }


              const nomeComprimido =
                file.name.replace(
                  /\.[^/.]+$/,
                  ''
                ) + '.jpg';


              const arquivoComprimido =
                new File(
                  [blob],
                  nomeComprimido,
                  {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  }
                );


              console.log(
                '[comprimirFoto] Original:',
                (
                  file.size /
                  1024 /
                  1024
                ).toFixed(2),
                'MB'
              );


              console.log(
                '[comprimirFoto] Comprimido:',
                (
                  arquivoComprimido.size /
                  1024 /
                  1024
                ).toFixed(2),
                'MB'
              );


              resolverUmaVez(
                arquivoComprimido
              );

            },
            'image/jpeg',
            quality
          );


        } catch (erroInterno) {

          console.error(
            '[comprimirFoto] Erro ao comprimir:',
            erroInterno
          );

          clearTimeout(timeoutId);

          resolverUmaVez(file);
        }
      };


      img.onerror = function () {

        console.error(
          '[comprimirFoto] O navegador não conseguiu ' +
          'decodificar a imagem.'
        );

        URL.revokeObjectURL(url);

        clearTimeout(timeoutId);

        resolverUmaVez(file);
      };


      img.src = url;


    } catch (erroExterno) {

      console.error(
        '[comprimirFoto] Erro inesperado:',
        erroExterno
      );

      clearTimeout(timeoutId);

      resolverUmaVez(file);
    }

  });
}


/* ─────────────────────────────────────────────
   FOTO PREVIEW
   Usa ObjectURL em vez de FileReader.
───────────────────────────────────────────── */

function formatarTamanho(bytes) {

  if (!bytes && bytes !== 0) return '';

  const mb = bytes / 1024 / 1024;

  if (mb >= 1) return mb.toFixed(1) + ' MB';

  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}


function mostrarPreviewSemImagem(arquivo, motivo) {

  /*
   * Usado quando não tentamos (ou não conseguimos)
   * decodificar a imagem no navegador para gerar uma
   * prévia visual — hoje isso é o caso de todo arquivo
   * HEIC/HEIF (fotos de iPhone), já que decodificar HEIC
   * via WebAssembly no navegador se mostrou instável em
   * celulares (trava/falha de forma imprevisível,
   * principalmente em Android com menos memória).
   *
   * Em vez de arriscar uma prévia quebrada, mostramos um
   * cartão simples confirmando a seleção do arquivo. O
   * arquivo original é enviado normalmente e a conversão
   * de verdade acontece no servidor (pillow-heif), que é
   * um ambiente confiável e sem essas limitações.
   */

  const preview =
    document.getElementById('foto-preview');

  const img =
    document.getElementById('foto-img');

  const nome =
    document.getElementById('foto-nome');

  const uploadPrompt =
    document.getElementById('upload-prompt');


  img.removeAttribute('src');

  img.style.display = 'none';

  preview.style.display = 'flex';

  nome.textContent =
    '📎 ' + arquivo.name +
    (formatarTamanho(arquivo.size)
      ? ' (' + formatarTamanho(arquivo.size) + ')'
      : '') +
    ' — foto selecionada' +
    (motivo === 'erro'
      ? ', prévia indisponível neste navegador'
      : '') +
    '.';

  uploadPrompt.style.display = 'none';
}


async function mostrarPreview(arquivo) {

  const preview =
    document.getElementById('foto-preview');

  const img =
    document.getElementById('foto-img');

  const nome =
    document.getElementById('foto-nome');

  const uploadPrompt =
    document.getElementById('upload-prompt');


  if (!arquivo) return;


  /*
   * Libera a URL anterior.
   */

  if (img.dataset.objectUrl) {

    URL.revokeObjectURL(
      img.dataset.objectUrl
    );

    delete img.dataset.objectUrl;
  }

  /* Garante que a <img> volte a aparecer, caso a
     prévia anterior tenha caído no cartão sem imagem. */
  img.style.display = '';


  const nomeMinusculo =
    (arquivo.name || '').toLowerCase();

  const pareceHeic =
    nomeMinusculo.endsWith('.heic') ||
    nomeMinusculo.endsWith('.heif') ||
    arquivo.type === 'image/heic' ||
    arquivo.type === 'image/heif';


  /*
   * HEIC/HEIF: não tentamos mais decodificar no
   * navegador (heic2any + WebAssembly se mostrou
   * instável em celulares — funcionava numa foto e
   * falhava em outra, sem padrão previsível). Mostramos
   * direto o cartão de confirmação.
   */

  if (pareceHeic) {

    mostrarPreviewSemImagem(arquivo);
    return;
  }


  /*
   * Formatos que o navegador decodifica nativamente
   * (JPEG, PNG, WEBP...) — prévia normal via ObjectURL.
   */

  const objectUrl =
    URL.createObjectURL(arquivo);


  img.dataset.objectUrl =
    objectUrl;


  img.src = objectUrl;


  preview.style.display =
    'flex';

  nome.textContent =
    arquivo.name;

  uploadPrompt.style.display =
    'none';


  img.onload = function () {

    console.log(
      '[mostrarPreview] Prévia carregada.'
    );

  };


  img.onerror = function () {

    console.warn(
      '[mostrarPreview] Não foi possível ' +
      'mostrar a prévia.'
    );

    mostrarPreviewSemImagem(arquivo, 'erro');
  };
}


/* ─────────────────────────────────────────────
  SELECIONAR FOTO
───────────────────────────────────────────── */
  let contadorFoto = 0;
  let fotoProcessando = false;

async function previewFoto(input) {

  const file =
    input.files[0];

  if (!file) return;


  const LIMITE_ORIGINAL_MB = 30;


  /*
   * Verifica tamanho original
   * ANTES de bloquear o botão.
   */

  if (
    file.size >
    LIMITE_ORIGINAL_MB *
    1024 *
    1024
  ) {

    mostrarErro(
      'A foto selecionada é muito grande. ' +
      'Escolha uma imagem menor.'
    );

    input.value = '';

    return;
  }


  /*
   * A partir daqui a foto é válida
   * e podemos iniciar o processamento.
   */

  const idFoto =
    ++contadorFoto;

  fotoProcessando = true;


  const botao =
    document.getElementById('btnEnviar');


  if (botao) {

    botao.disabled = true;

    botao.classList.add(
      'processando-foto'
    );

    botao.innerHTML =
      '⏳ Preparando foto...';
  }


  const uploadPrompt =
    document.getElementById(
      'upload-prompt'
    );


  /*
   * Mostra a prévia (converte HEIC/HEIF em JPEG
   * antes de exibir, quando necessário).
   */

  await mostrarPreview(file);


  const uploadPromptTextoOriginal =
    uploadPrompt.innerHTML;


  uploadPrompt.innerHTML = `
    <p class="upload-text">
      <strong>Processando foto...</strong>
    </p>
  `;


  try {

    const arquivoComprimido =
      await comprimirFoto(file);


    /*
     * Verifica se o usuário escolheu
     * outra foto durante o processamento.
     */

    if (idFoto !== contadorFoto) {

      console.log(
        '[previewFoto] Foto antiga ignorada.'
      );

      return;
    }


    /*
     * Substitui o arquivo original
     * pelo comprimido.
     */

    if (
      arquivoComprimido &&
      arquivoComprimido !== file &&
      typeof DataTransfer !== 'undefined'
    ) {

      try {

        const dataTransfer =
          new DataTransfer();


        dataTransfer.items.add(
          arquivoComprimido
        );


        input.files =
          dataTransfer.files;


        console.log(
          '[previewFoto] Arquivo comprimido ' +
          'pronto para envio.'
        );


      } catch (erroDataTransfer) {

        console.error(
          '[previewFoto] Não foi possível ' +
          'substituir o arquivo comprimido:',
          erroDataTransfer
        );
      }
    }


  } catch (erroCompressao) {

    console.error(
      '[previewFoto] Erro na compressão:',
      erroCompressao
    );


  } finally {

    /*
     * Só libera o botão se esta ainda
     * for a foto atual.
     */

    if (idFoto === contadorFoto) {

      fotoProcessando = false;


      uploadPrompt.innerHTML =
        uploadPromptTextoOriginal;


      const botao =
        document.getElementById(
          'btnEnviar'
        );


      if (botao) {

        botao.disabled = false;

        botao.classList.remove(
          'processando-foto'
        );

        botao.innerHTML =
          'CONFIRMAR INSCRIÇÃO';
      }
    }
  }
}


/* ─────────────────────────────────────────────
   REMOVER FOTO
───────────────────────────────────────────── */

  function removerFoto() {

    contadorFoto++;
    fotoProcessando = false;

    const input =
      document.getElementById('f-foto');

    const preview =
      document.getElementById('foto-preview');

    const img =
      document.getElementById('foto-img');

    const uploadPrompt =
      document.getElementById('upload-prompt');


    /*
    * Libera a URL temporária.
    */

    if (img.dataset.objectUrl) {

      URL.revokeObjectURL(
        img.dataset.objectUrl
      );

      delete img.dataset.objectUrl;
    }


    /*
    * Remove o arquivo.
    */

    input.value = '';


    /*
    * Esconde a prévia.
    */

    preview.style.display =
      'none';


    /*
    * Mostra novamente
    * a área de upload.
    */

    uploadPrompt.style.display =
      'block';
  }

  /* ─────────────────────────────
     VALIDAR EMAIL
  ───────────────────────────── */

  function emailValido(email) {

    return /\S+@\S+\.\S+/.test(email);
  }

  /* ─────────────────────────────
     ALERTA ERRO
  ───────────────────────────── */

  function mostrarErro(msg) {

    const erro = document.getElementById('form-erro');

    erro.style.display = 'block';

    erro.innerHTML = msg;

    erro.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  function esconderErro() {

    const erro = document.getElementById('form-erro');

    erro.style.display = 'none';

    erro.innerHTML = '';
  }

  /* ─────────────────────────────
     VALIDAR GRUPO DE RADIO
     (marca o grupo em vermelho quando
     nenhuma opção foi selecionada)
  ───────────────────────────── */

  function validarGrupoRadio(name, mensagem) {

    const opcoes = document.querySelectorAll('input[name="' + name + '"]');
    const grupo = opcoes.length ? opcoes[0].closest('.radio-group') : null;
    const selecionado = document.querySelector('input[name="' + name + '"]:checked');

    if (!selecionado) {

      if (grupo) grupo.classList.add('erro');

      mostrarErro(mensagem);

      return false;
    }

    if (grupo) grupo.classList.remove('erro');

    return true;
  }

  /* ─────────────────────────────
     ENVIAR FORMULÁRIO
  ───────────────────────────── */

  function enviarForm() {

    esconderErro();

    const nome = document.getElementById('f-nome');
    const tel = document.getElementById('f-tel');
    const email = document.getElementById('f-email');
    const nasc = document.getElementById('f-nasc');
    const tamanho = document.getElementById('f-tamanho');
    const responsavel = document.getElementById('f-responsavel');
    const parentesco = document.getElementById('f-parentesco');
    const telResponsavel = document.getElementById('f-tel-responsavel');
    const expectativa = document.getElementById('f-expectativa');
    const chamouRet = document.getElementById('f-chamou_ret');
    const foto = document.getElementById('f-foto');

    /* limpa bordas e destaques de erro */

    document.querySelectorAll('input, textarea, select').forEach(campo => {
      campo.classList.remove('erro');
    });

    document.querySelectorAll('.radio-group').forEach(grupo => {
      grupo.classList.remove('erro');
    });

    document.querySelectorAll('.checkbox-opt').forEach(caixa => {
      caixa.classList.remove('erro');
    });

    /* VALIDAÇÕES */

    if (nome.value.trim() === '') {

      nome.classList.add('erro');

      mostrarErro('Por favor, informe seu nome completo.');

      return;
    }

    if (tel.value.trim().length < 14) {

      tel.classList.add('erro');

      mostrarErro('Informe um telefone válido.');

      return;
    }

    if (!emailValido(email.value)) {

      email.classList.add('erro');

      mostrarErro('Digite um e-mail válido.');

      return;
    }

    if (!validarData(nasc.value)) {

      nasc.classList.add("erro");

      mostrarErro("Informe uma data de nascimento válida.");

      return;
    }

    if (!validarGrupoRadio('modelo_camiseta', 'Selecione o modelo de camiseta.')) {

      return;
    }

    if (tamanho.value === '') {

      tamanho.classList.add('erro');

      mostrarErro('Selecione o tamanho da camiseta.');

      return;
    }

    if (responsavel.value.trim() === '') {

      responsavel.classList.add('erro');

      mostrarErro('Informe o nome do responsável.');

      return;
    }

    if (parentesco.value === '') {

      parentesco.classList.add('erro');

      mostrarErro('Selecione o parentesco do responsável.');

      return;
    }

    if (telResponsavel.value.trim().length < 14) {

      telResponsavel.classList.add('erro');

      mostrarErro('Informe o telefone do responsável.');

      return;
    }

    if (!validarGrupoRadio('retiro_ant', 'Selecione se você já participou de algum retiro.')) {

      return;
    }

    if (expectativa.value.trim().length < 5) {

      expectativa.classList.add('erro');

      mostrarErro('Conte um pouco mais sobre suas expectativas.');

      return;
    }

    if (chamouRet.value === '') {

      chamouRet.classList.add('erro');

      mostrarErro('Selecione como você ficou sabendo do VII Desperta.');

      return;
    }

    if (!validarGrupoRadio('ansiedade', 'Selecione uma opção sobre como está a sua ansiedade para o retiro.')) {

      return;
    }

    if (!validarGrupoRadio('carne_sex', 'Informe se deseja optar por alimentação sem carne às sextas-feiras.')) {

      return;
    }

    if (!validarGrupoRadio('alergia', 'Informe se possui alergia alimentar.')) {

      return;
    }

    if (!validarGrupoRadio('remedio', 'Informe se utiliza medicamentos.')) {

      return;
    }

    if (!validarGrupoRadio('necessidade', 'Informe se há alguma necessidade, limitação ou informação importante que a equipe deva saber.')) {

      return;
    }

    if (!validarGrupoRadio('transporte', 'Selecione como você irá se deslocar até o retiro.')) {

      return;
    }

    /* Pergunta de carona só é obrigatória quando o campo está visível */

    const extraTransporte = document.getElementById('extra-transporte');

    if (extraTransporte && extraTransporte.style.display !== 'none') {

      if (!validarGrupoRadio('carona', 'Informe se há possibilidade de dar carona para quem necessitar.')) {

        return;
      }
    }

    if (!validarGrupoRadio('forma_pagamento', 'Selecione a forma de pagamento.')) {

      return;
    }

/* ─────────────────────────────
   AUTORIZAÇÃO DE IMAGEM
───────────────────────────── */

  const direitoImagem =
    document.querySelector(
      'input[name="direito_de_imag"]:checked'
    );

  if (!direitoImagem) {

    const caixaImagem = document.querySelector('.checkbox-opt');

    if (caixaImagem) caixaImagem.classList.add('erro');

    mostrarErro(
      'Informe se você autoriza o uso da imagem.'
    );

    return;
  }

/* ─────────────────────────────
   FOTO
───────────────────────────── */

  if (fotoProcessando) {

    mostrarErro(
      'Aguarde a foto terminar de ser processada.'
    );

    return;
  }


  if (!foto.files[0]) {

    mostrarErro(
      'Envie sua foto para o evento.'
    );

    return;
  }


  /*
  * Segurança:
  * verifica o tamanho final.
  */

  const LIMITE_ENVIO_MB = 8;

    if (
      foto.files[0].size >
      LIMITE_ENVIO_MB * 1024 * 1024
    ) {

    mostrarErro(
      'A foto ainda está muito grande mesmo ' +
      'após a compressão. Tente uma foto diferente.'
    );

    return;
  } 

    /* Trava do botão enviar o formulario e alteração de estado */
    
    const botao = document.getElementById("btnEnviar");

    botao.innerHTML = "⏳ Enviando...";
    botao.classList.add("enviando");
    botao.disabled = true;
    
    /* SUCESSO */

    document.getElementById('form-inscricao').submit();

    window.scrollTo({
      behavior: 'smooth'
    });
  }

  function copiarPix() {

    const chavePix = "rayychampaoski@gmail.com"; // Subistituir pela chave pix de quer for receber as inscrições
    
    const botao = document.getElementById("btnPix");

    navigator.clipboard.writeText(chavePix)
        .then(() => {

            botao.innerHTML = "✅ Chave PIX copiada!";
            botao.classList.add("copiado");
            botao.disabled = true;

            setTimeout(() => {
                botao.innerHTML = "📋 Copiar chave PIX";
                botao.classList.remove("copiado");
                botao.disabled = false;
            }, 2500);

        })
        .catch((err) => {
            console.error(err);
            alert("Não foi possível copiar a chave PIX.");
        });

  }
