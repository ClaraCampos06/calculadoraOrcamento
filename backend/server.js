require("dotenv").config()

const db = require("./db")
const precos = require("./precos")
const agenda = require("./agenda")
const express = require("express")
const path = require("path")
const rateLimit = require("express-rate-limit")

const app = express()

// no Render existe um intermediário (proxy); sem isso todos pareceriam o mesmo IP
app.set("trust proxy", 1)

const limitePedidos = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hora
    limit: 10,                  // 10 pedidos por hora por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitos pedidos em pouco tempo. Tente novamente mais tarde." }
})

const limiteHorarios = rateLimit({
    windowMs: 60 * 1000,        // 1 minuto
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas consultas. Aguarde um instante." }
})

const limiteAdmin = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutos
    limit: 10,                  // 10 tentativas ERRADAS
    skipSuccessfulRequests: true,   // acertos não contam
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Aguarde 15 minutos." }
})

const PORTA = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

app.get("/teste", (req, res) => {
    res.json({ mensagem: "Olá! O backend está funcionando." })
})

const NUMERO_ESTUDIO = process.env.NUMERO_ESTUDIO

function arredondar(valor) {
    return Math.round(valor / 10) * 10
}

// horários livres de um dia
app.get("/api/horarios", limiteHorarios, (req, res) => {          // ADICIONADO: limiteHorarios
    const data = String(req.query.data || "")

    if (!agenda.dataValida(data)) {
        return res.status(400).json({ erro: "Data inválida." })
    }

    const hoje = agenda.hoje()
    if (data < hoje) {
        return res.status(400).json({ erro: "Escolha uma data a partir de hoje." })
    }
    if (data > agenda.somarDias(hoje, agenda.diasAFrente)) {
        return res.status(400).json({ erro: "Data muito distante." })
    }

    if (!agenda.diasAtendimento.includes(agenda.diaDaSemana(data))) {
        return res.json({ horarios: [] })
    }

    const ocupados = db
        .prepare("SELECT horario FROM orcamentos WHERE data = ? AND status != 'cancelado'")
        .all(data)
        .map(linha => linha.horario)

    let livres = agenda.horarios.filter(h => !ocupados.includes(h))

    if (data === hoje) {
        const agora = agenda.agora()
        livres = livres.filter(h => h > agora)
    }

    res.json({ horarios: livres })
})

app.post("/api/orcamento", limitePedidos, (req, res) => {         // ADICIONADO: limitePedidos
    const { estilo, cor, regiao, detalhes } = req.body
    const tamanho = Number(req.body.tamanho)
    const nome = String(req.body.nome || "").trim()
    const telefone = String(req.body.telefone || "").replace(/\D/g, "")
    const data = String(req.body.data || "")
    const horario = String(req.body.horario || "")

    // validar: nunca confie no que vem do navegador
    if (!tamanho || tamanho <= 0 || tamanho > 100) {
        return res.status(400).json({ erro: "Informe um tamanho entre 1 e 100 cm." })
    }
    if (nome.length < 2 || nome.length > 60) {
        return res.status(400).json({ erro: "Informe seu nome." })
    }
    if (telefone.length < 10 || telefone.length > 11) {
        return res.status(400).json({ erro: "Informe um WhatsApp válido, com DDD." })
    }

    // validar data e horário
    const hoje = agenda.hoje()
    if (!agenda.dataValida(data) ||
        data < hoje ||
        data > agenda.somarDias(hoje, agenda.diasAFrente) ||
        !agenda.diasAtendimento.includes(agenda.diaDaSemana(data)) ||
        !agenda.horarios.includes(horario)) {
        return res.status(400).json({ erro: "Escolha uma data e um horário disponíveis." })
    }
    if (data === hoje && horario <= agenda.agora()) {
        return res.status(400).json({ erro: "Esse horário já passou. Escolha outro." })
    }

    // ADICIONADO: máximo de 2 agendamentos em aberto por WhatsApp
    const emAberto = db
        .prepare("SELECT COUNT(*) AS total FROM orcamentos WHERE telefone = ? AND status != 'cancelado' AND data >= ?")
        .get(telefone, hoje).total

    if (emAberto >= 2) {
        return res.status(429).json({ erro: "Você já tem 2 agendamentos em aberto. Aguarde o retorno do estúdio." })
    }

    

    if (!Object.hasOwn(precos.estilo, estilo) ||
        !Object.hasOwn(precos.cores, cor) ||
        !Object.hasOwn(precos.regiao, regiao) ||
        !Object.hasOwn(precos.detalhes, detalhes)) {
        return res.status(400).json({ erro: "Dados inválidos." })
    }

    const total =
        (precos.valorBase + tamanho * precos.valorPorCm) *
        precos.estilo[estilo] * precos.cores[cor] *
        precos.regiao[regiao] * precos.detalhes[detalhes]

    const minimo = Math.max(arredondar(total * (1 - precos.margem)), precos.valorMinimo)
    const maximo = Math.max(arredondar(total * (1 + precos.margem)), minimo)

    // gravar com data, horário e status
    try {
        db.prepare(`
            INSERT INTO orcamentos
            (nome, telefone, data, horario, status, tamanho, estilo, cor, regiao, detalhes, minimo, maximo)
            VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?)
        `).run(nome, telefone, data, horario, tamanho, estilo, cor, regiao, detalhes, minimo, maximo)
    } catch (erro) {
        if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ erro: "Esse horário acabou de ser reservado. Escolha outro." })
        }
        throw erro
    }

    res.json({ minimo, maximo, numero: NUMERO_ESTUDIO, data, horario })
})

app.get("/api/admin/orcamentos", limiteAdmin, (req, res) => {     // ADICIONADO: limiteAdmin
    const token = req.get("x-admin-token")

    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const lista = db.prepare("SELECT * FROM orcamentos ORDER BY id DESC LIMIT 100").all()
    res.json(lista)
})

app.patch("/api/admin/orcamentos/:id/status", limiteAdmin, (req, res) => {   // ADICIONADO: limiteAdmin
    const token = req.get("x-admin-token")

    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const id = Number(req.params.id)
    const status = String(req.body.status || "")

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "Orçamento inválido." })
    }
    if (!["pendente", "confirmado", "cancelado"].includes(status)) {
        return res.status(400).json({ erro: "Status inválido." })
    }

    try {
        const resultado = db
            .prepare("UPDATE orcamentos SET status = ? WHERE id = ?")
            .run(status, id)

        if (resultado.changes === 0) {
            return res.status(404).json({ erro: "Orçamento não encontrado." })
        }
    } catch (erro) {
        // reabrir um cancelado cujo horário já foi reservado por outro cliente
        if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ erro: "Esse horário já foi reservado por outro cliente." })
        }
        throw erro
    }

    res.json({ ok: true })
})

app.get("/api/admin/orcamentos/:id/aviso", limiteAdmin, (req, res) => {
    const token = req.get("x-admin-token")

    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "Orçamento inválido." })
    }

    const o = db.prepare("SELECT * FROM orcamentos WHERE id = ?").get(id)
    if (!o) {
        return res.status(404).json({ erro: "Orçamento não encontrado." })
    }
    if (!o.data || !["confirmado", "cancelado"].includes(o.status)) {
        return res.status(400).json({ erro: "Só dá para avisar agendamentos confirmados ou cancelados." })
    }

    const tatuador = process.env.NOME_TATUADOR || "o estúdio"
    const endereco = process.env.ENDERECO_ESTUDIO || "a combinar"
    const mapa = process.env.LINK_MAPA || ""

    const partes = o.data.split("-")
    const dataBR = partes[2] + "/" + partes[1] + "/" + partes[0]

    let linhas
    if (o.status === "confirmado") {
        linhas = [
            "✅ *Agendamento confirmado!*",
            "",
            "Olá, " + o.nome + "! Seu horário está garantido.",
            "",
            "📅 *Data:* " + dataBR,
            "🕐 *Horário:* " + o.horario,
            "📍 *Local:* " + endereco,
            "🖋️ *Tatuador(a):* " + tatuador
        ]
        if (mapa) linhas.push("🗺️ *Mapa:* " + mapa)
        linhas.push("", "Qualquer dúvida é só responder por aqui. Até lá! 🖤")
    } else {
        linhas = [
            "Olá, " + o.nome + "!",
            "",
            "Infelizmente precisamos cancelar o agendamento de *" + dataBR + " às " + o.horario + "*.",
            "",
            "Se quiser, é só escolher outro horário pelo site, ou me responder por aqui que a gente combina. 🖤",
            "— " + tatuador
        ]
    }

    const link = "https://wa.me/55" + o.telefone + "?text=" + encodeURIComponent(linhas.join("\n"))
    res.json({ link })
})

app.listen(PORTA, () => {
    console.log(`Servidor rodando em http://localhost:${PORTA}`)
})