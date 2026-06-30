
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

  /* ─────────────────────────────
     FOTO PREVIEW
  ───────────────────────────── */

  function previewFoto(input) {

    const file = input.files[0];

    if (!file) return;

    const preview = document.getElementById('foto-preview');
    const img = document.getElementById('foto-img');
    const nome = document.getElementById('foto-nome');
    const uploadPrompt = document.getElementById('upload-prompt');

    const reader = new FileReader();

    reader.onload = function (e) {

      img.src = e.target.result;

      preview.style.display = 'flex';

      nome.textContent = file.name;

      uploadPrompt.style.display = 'none';
    }

    reader.readAsDataURL(file);
  }

  /* ─────────────────────────────
     REMOVER FOTO
  ───────────────────────────── */

  function removerFoto() {

    document.getElementById('f-foto').value = '';

    document.getElementById('foto-preview').style.display = 'none';

    document.getElementById('upload-prompt').style.display = 'block';
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
     ENVIAR FORMULÁRIO
  ───────────────────────────── */

  function enviarForm() {

    esconderErro();

    const nome = document.getElementById('f-nome');
    const tel = document.getElementById('f-tel');
    const email = document.getElementById('f-email');
    const nasc = document.getElementById('f-nasc');
    const responsavel = document.getElementById('f-responsavel');
    const parentesco = document.getElementById('f-parentesco');
    const telResponsavel = document.getElementById('f-tel-responsavel');
    const expectativa = document.getElementById('f-expectativa');
    const foto = document.getElementById('f-foto');

    /* limpa bordas */

   document.querySelectorAll('input, textarea, select').forEach(campo => {
      campo.classList.remove('erro');
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

    const retiro = document.querySelector('input[name="retiro_ant"]:checked');

    if (!retiro) {

      mostrarErro('Selecione se você já participou de algum retiro.');

      return;
    }

    if (expectativa.value.trim().length < 5) {

      expectativa.classList.add('erro');

      mostrarErro('Conte um pouco mais sobre suas expectativas.');

      return;
    }

    const alergia = document.querySelector('input[name="alergia"]:checked');

    if (!alergia) {

      mostrarErro('Informe se possui alergia alimentar.');

      return;
    }

    const remedio = document.querySelector('input[name="remedio"]:checked');

    if (!remedio) {

      mostrarErro('Informe se utiliza medicamentos.');

      return;
    }

    if (!foto.files[0]) {

      mostrarErro('Envie sua foto para o evento.');

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

    const chavePix = "Olá galerinha do Yeshua!";

    const botao = document.getElementById("btnPix");

    navigator.clipboard.writeText(chavePix);

    botao.innerHTML = "✅ Chave PIX copiada!";

    botao.classList.add("copiado");

    botao.disabled = true;

    setTimeout(() => {

        botao.innerHTML = "📋 Copiar chave PIX";

        botao.classList.remove("copiado");

        botao.disabled = false;

    }, 2500);

}

  
