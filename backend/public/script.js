const formulario = document.getElementById("formularioOrcamento");
const textoResultado = document.getElementById("textoResultado");
const linkWhatsapp = document.getElementById("linkWhatsapp");

const campoData = document.getElementById("data");
const campoHorario = document.getElementById("horario");
const avisoHorario = document.getElementById("avisoHorario");

// não deixa escolher um dia que já passou
campoData.min = new Date().toLocaleDateString("sv-SE");

// "2026-10-20" vira "20/10/2026" (sem usar Date, para não mudar o dia por causa do fuso)
function formatarDataBR(iso) {
    const partes = iso.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
}

async function carregarHorarios() {
    campoHorario.textContent = "";
    campoHorario.disabled = true;
    avisoHorario.textContent = "";

    if (!campoData.value) return;

    try {
        const resposta = await fetch("/api/horarios?data=" + campoData.value);
        const dados = await resposta.json();

        if (!resposta.ok) {
            avisoHorario.textContent = dados.erro;
            return;
        }
        if (dados.horarios.length === 0) {
            avisoHorario.textContent = "Sem horários livres nesse dia. Escolha outra data.";
            return;
        }

        campoHorario.add(new Option("Escolha um horário", ""));
        dados.horarios.forEach(function (h) {
            campoHorario.add(new Option(h, h));
        });
        campoHorario.disabled = false;
    } catch (erro) {
        avisoHorario.textContent = "Não foi possível carregar os horários.";
    }
}

campoData.addEventListener("change", carregarHorarios);

formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    const tamanho = Number(document.getElementById("tamanho").value);
    const estilo = document.getElementById("estilo").value;
    const regiao = document.getElementById("regiaoCorpo").value;
    const detalhes = document.getElementById("detalhes").value;
    const corSelecionada = document.querySelector('input[name="cores"]:checked');
    const nome = document.getElementById("nome").value.trim();
    const telefone = document.getElementById("telefone").value.replace(/\D/g, "");
    const data = campoData.value;
    const horario = campoHorario.value;

    if (!tamanho || tamanho <= 0) {
        mostrarErro("Informe o tamanho aproximado em centímetros.");
        return;
    }
    if (!corSelecionada) {
        mostrarErro("Escolha entre preto e branco ou colorida.");
        return;
    }
    if (!data) {
        mostrarErro("Escolha o dia desejado.");
        return;
    }
    if (!horario) {
        mostrarErro("Escolha um horário disponível.");
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
            body: JSON.stringify({ tamanho, estilo, cor, regiao, detalhes, nome, telefone, data, horario })
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
            mostrarErro(dados.erro);
            carregarHorarios();   // atualiza a lista (alguém pode ter reservado antes)
            return;
        }

        const escolhas = {
            nome: nome,
            tamanho: tamanho,
            estilo: textoDoSelect("estilo"),
            cor: cor,
            regiao: textoDoSelect("regiaoCorpo"),
            detalhes: textoDoSelect("detalhes")
        };
        mostrarResultado(dados, escolhas);
        carregarHorarios();       // o horário que você acabou de reservar some da lista
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
        "Simulação de orçamento:",
        "",
        "*Tamanho:* " + escolhas.tamanho + " cm",
        "*Estilo:* " + escolhas.estilo,
        "*Cores:* " + escolhas.cor,
        "*Região:* " + escolhas.regiao,
        "*Detalhes:* " + escolhas.detalhes,
        "Data: " + formatarDataBR(estimativa.data) + " às " + estimativa.horario,
        "",
        "*Estimativa do site:* " + formatarReal(estimativa.minimo) + " a " + formatarReal(estimativa.maximo),
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

            textoResultado.innerHTML +=
        "<br><br>📅 <strong>" + formatarDataBR(estimativa.data) + " às " + estimativa.horario + "</strong>" +
        "<br><small>Horário reservado como pendente. O tatuador vai avaliar e confirmar com você.</small>";

    const mensagem = montarMensagem(estimativa, escolhas);

    linkWhatsapp.href =
        "https://wa.me/" + estimativa.numero + "?text=" + encodeURIComponent(mensagem);

    linkWhatsapp.hidden = false;
}

function mostrarErro(mensagem) {
    textoResultado.textContent = mensagem;
    linkWhatsapp.hidden = true; // esconde o botão
}