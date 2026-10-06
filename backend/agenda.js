const FUSO = "America/Sao_Paulo"

// 0 = domingo, 1 = segunda ... 6 = sábado
const diasAtendimento = [1, 2, 3, 4, 5, 6]

// horários de início das sessões (exemplos, ajuste com o tatuador)
const horarios = ["08:00", "10:00", "12:00", "14:00", "16:00", "17:00", "19:00", "21:00"]

// até quantos dias à frente o cliente pode marcar
const diasAFrente = 60

// o servidor do Render usa outro fuso, então fixamos o de Brasília
function hoje() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: FUSO })
}

function agora() {
    return new Date().toLocaleTimeString("sv-SE", {
        timeZone: FUSO, hour: "2-digit", minute: "2-digit"
    })
}

// aceita só datas reais no formato 2026-10-20
function dataValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
    const d = new Date(texto + "T12:00:00Z")
    return !isNaN(d) && d.toISOString().slice(0, 10) === texto
}

function diaDaSemana(texto) {
    return new Date(texto + "T12:00:00Z").getUTCDay()
}

function somarDias(texto, dias) {
    const d = new Date(texto + "T12:00:00Z")
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
}

module.exports = {
    diasAtendimento, horarios, diasAFrente,
    hoje, agora, dataValida, diaDaSemana, somarDias
}