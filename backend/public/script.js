const formulario = document.getElementById("formularioOrcamento");
const textoResultado = document.getElementById("textoResultado");
const linkWhatsapp = document.getElementById("linkWhatsapp");

formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    // ... o resto continua igual
    const tamanho = Number(document.getElementById("tamanho").value);
    const estilo = document.getElementById("estilo").value;
    const regiao = document.getElementById("regiaoCorpo").value;
    const detalhes = document.getElementById("detalhes").value;
    const corSelecionada = document.querySelector('input[name="cores"]:checked');
    const nome = document.getElementById("nome").value.trim();
    const telefone = document.getElementById("telefone").value.replace(/\D/g, "");

    if (!tamanho || tamanho <= 0) {
        mostrarErro("Informe o tamanho aproximado em centímetros.");
        return;
    }
    if (!corSelecionada) {
        mostrarErro("Escolha entre preto e branco ou colorida.");
        return;
    }
    if (nome.length < 2) {
        mostrarErro("Informe seu nome.");
        return;
    }
    if (telefone.length < 10 || telefone.length > 11) {
        mostrarErro("Informe um WhatsApp válido, com DDD.");
        return;
    }
    const cor = corSelecionada.value;
    
    try {
        const resposta = await fetch("/api/orcamento", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tamanho, estilo, cor, regiao, detalhes, nome, telefone })
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
            mostrarErro(dados.erro);
            return;
        }

        const escolhas = {
            tamanho: tamanho,
            estilo: textoDoSelect("estilo"),
            cor: cor,
            regiao: textoDoSelect("regiaoCorpo"),
            detalhes: textoDoSelect("detalhes")
        };
        mostrarResultado(dados, escolhas);
    } catch (erro) {
        mostrarErro("Não foi possível calcular agora. Tente novamente.");
    }
});


// arredonda para a dezena mais próxima (ex: 487 vira 490)


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
        "*inkBudget()*",
        "💳Simulação de orçamento:",
        "",
        "*Tamanho:* " + escolhas.tamanho + " cm",
        "*Estilo:* " + escolhas.estilo,
        "*Cores:* " + escolhas.cor,
        "*Região:* " + escolhas.regiao,
        "*Detalhes:* " + escolhas.detalhes,
        "",
        "*💰Estimativa do site:* " + formatarReal(estimativa.minimo) + " a " + formatarReal(estimativa.maximo),
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
    textoResultado.innerHTML =
        "Estimativa:<br><strong>" + formatarReal(estimativa.minimo) + " a " + formatarReal(estimativa.maximo) + "</strong><br>" +
        "Este valor é apenas uma noção aproximada. O orçamento final é passado pelo tatuador.";

    const mensagem = montarMensagem(estimativa, escolhas);

    linkWhatsapp.href =
        "https://wa.me/" + estimativa.numero + "?text=" + encodeURIComponent(mensagem);

    linkWhatsapp.hidden = false;
}

function mostrarErro(mensagem) {
    textoResultado.textContent = mensagem;
    linkWhatsapp.hidden = true; // esconde o botão
}