// =====================================================
// PASSO 1: tabela de preços
// ATENÇÃO: todos os valores abaixo são EXEMPLOS.
// Troque pelos números reais combinados com o tatuador.
// As chaves (realista, braco, etc.) precisam ser IGUAIS
// aos "value" dos campos no HTML.
// =====================================================
const precos = {
    valorMinimo: 150,   // menor estimativa que o site pode mostrar
    valorBase: 100,     // valor fixo de qualquer tatuagem
    valorPorCm: 12,     // quanto soma a cada centímetro
    margem: 0.15,       // faixa de 15% para baixo e para cima

    // multiplicadores: 1.0 = não muda o preço, 1.5 = 50% mais caro
    estilo: {
        realista: 1.5,
        blackwork: 1.0,
        oriental: 1.3
    },
    cores: {
        "preto e branco": 1.0,
        colorida: 1.25
    },
    regiao: {
        cabeca: 1.3,
        rosto: 1.4,
        pescoco: 1.3,
        torax: 1.1,
        braco: 1.0,
        mao: 1.3,
        barriga: 1.1,
        coxa: 1.0,
        canela: 1.1,
        pe: 1.2
    },
    detalhes: {
        pouco: 1.0,
        medio: 1.3,
        muito: 1.6
    }
};

// =====================================================
// PASSO 2: dados do WhatsApp do estúdio
// Formato: 55 + DDD + número, SÓ NÚMEROS (sem +, espaço,
// parênteses ou traço). Troque pelo número real.
// =====================================================
const NUMERO_ESTUDIO = "5500900000000";

// =====================================================
// PASSO 3: pegar os elementos da página
// =====================================================
const formulario = document.getElementById("formularioOrcamento");
const textoResultado = document.getElementById("textoResultado");
const linkWhatsapp = document.getElementById("linkWhatsapp");

// =====================================================
// PASSO 4: escutar o envio do formulário
// =====================================================
formulario.addEventListener("submit", function (evento) {
    // impede a página de recarregar ao clicar no botão
    evento.preventDefault();

    // ler o que o cliente escolheu
    const tamanho = Number(document.getElementById("tamanho").value);
    const estilo = document.getElementById("estilo").value;
    const regiao = document.getElementById("regiaoCorpo").value;
    const detalhes = document.getElementById("detalhes").value;
    const corSelecionada = document.querySelector('input[name="cores"]:checked');

    // validar antes de calcular
    if (!tamanho || tamanho <= 0) {
        mostrarErro("Informe o tamanho aproximado em centímetros.");
        return;
    }
    if (!corSelecionada) {
        mostrarErro("Escolha entre preto e branco ou colorida.");
        return;
    }
    const cor = corSelecionada.value;

    // calcular
    const estimativa = calcularEstimativa(tamanho, estilo, cor, regiao, detalhes);

    // PASSO 5: guardar as escolhas em formato legível para a mensagem
    // (o "value" é para o código, o "text" é o que o cliente lê)
    const escolhas = {
        tamanho: tamanho,
        estilo: textoDoSelect("estilo"),
        cor: cor,
        regiao: textoDoSelect("regiaoCorpo"),
        detalhes: textoDoSelect("detalhes")
    };

    mostrarResultado(estimativa, escolhas);
});

// =====================================================
// A conta
// =====================================================
function calcularEstimativa(tamanho, estilo, cor, regiao, detalhes) {
    // parte que depende do tamanho
    const base = precos.valorBase + tamanho * precos.valorPorCm;

    // cada escolha multiplica o valor
    const total =
        base *
        precos.estilo[estilo] *
        precos.cores[cor] *
        precos.regiao[regiao] *
        precos.detalhes[detalhes];

    // em vez de um número só, damos uma faixa
    let minimo = arredondar(total * (1 - precos.margem));
    let maximo = arredondar(total * (1 + precos.margem));

    // nunca mostrar abaixo do valor mínimo do estúdio
    minimo = Math.max(minimo, precos.valorMinimo);
    maximo = Math.max(maximo, minimo);

    return { minimo, maximo };
}

// arredonda para a dezena mais próxima (ex: 487 vira 490)
function arredondar(valor) {
    return Math.round(valor / 10) * 10;
}

// transforma 490 em "R$ 490"
function formatarReal(valor) {
    return valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0
    });
}

// pega o texto da opção escolhida (ex: "Braço" em vez de "braco")
function textoDoSelect(id) {
    const campo = document.getElementById(id);
    return campo.options[campo.selectedIndex].text;
}

// =====================================================
// PASSO 6: montar a mensagem do WhatsApp
// =====================================================
function montarMensagem(estimativa, escolhas) {
    const linhas = [
        "Olá! Fiz uma simulação no site e gostaria de conversar sobre uma tatuagem.",
        "",
        "Tamanho: " + escolhas.tamanho + " cm",
        "Estilo: " + escolhas.estilo,
        "Cores: " + escolhas.cor,
        "Região: " + escolhas.regiao,
        "Detalhes: " + escolhas.detalhes,
        "Estimativa do site: " + formatarReal(estimativa.minimo) + " a " + formatarReal(estimativa.maximo),
        "",
        "Pode me passar o orçamento certinho?"
    ];

    // junta tudo, uma linha embaixo da outra
    return linhas.join("\n");
}

// =====================================================
// PASSO 7: mostrar na tela e ativar o botão
// =====================================================
function mostrarResultado(estimativa, escolhas) {
    textoResultado.textContent =
        "Estimativa: " + formatarReal(estimativa.minimo) + " a " + formatarReal(estimativa.maximo) +
        ". Este valor é apenas uma noção aproximada. O orçamento final é passado pelo tatuador.";

    const mensagem = montarMensagem(estimativa, escolhas);

    // encodeURIComponent troca espaços, acentos e quebras de linha
    // por códigos que podem ir dentro de um link
    linkWhatsapp.href =
        "https://wa.me/" + NUMERO_ESTUDIO + "?text=" + encodeURIComponent(mensagem);

    linkWhatsapp.hidden = false; // mostra o botão
}

function mostrarErro(mensagem) {
    textoResultado.textContent = mensagem;
    linkWhatsapp.hidden = true; // esconde o botão
}