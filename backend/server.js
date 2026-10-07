require("dotenv").config()

const { pool, iniciar } = require("./db")
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
    skipSuccessfulRequests: true,
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

function adminAutorizado(req) {
    const token = req.get("x-admin-token")
    return Boolean(process.env.ADMIN_TOKEN) && token === process.env.ADMIN_TOKEN
}

// horários livres de um dia
app.get("/api/horarios", limiteHorarios, async (req, res) => {
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

    const resultado = await pool.query(
        "SELECT horario FROM orcamentos WHERE data = $1 AND status <> 'cancelado'",
        [data]
    )
    const ocupados = resultado.rows.map(linha => linha.horario)

    let livres = agenda.horarios.filter(h => !ocupados.includes(h))

    if (data === hoje) {
        const agora = agenda.agora()
        livres = livres.filter(h => h > agora)
    }

    res.json({ horarios: livres })
})

app.post("/api/orcamento", limitePedidos, async (req, res) => {
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

    // máximo de 2 agendamentos em aberto por WhatsApp
    const contagem = await pool.query(
        "SELECT COUNT(*)::int AS total FROM orcamentos WHERE telefone = $1 AND status <> 'cancelado' AND data >= $2",
        [telefone, hoje]
    )
    if (contagem.rows[0].total >= 2) {
        return res.status(429).json({ erro: "Você já tem 2 agendamentos em aberto. Aguarde o retorno do estúdio." })
    }

       const invalidos = []
    if (!Object.hasOwn(precos.estilo, estilo)) invalidos.push("estilo: " + estilo)
    if (!Object.hasOwn(precos.cores, cor)) invalidos.push("cor: " + cor)
    if (!Object.hasOwn(precos.regiao, regiao)) invalidos.push("regiao: " + regiao)
    if (!Object.hasOwn(precos.detalhes, detalhes)) invalidos.push("detalhes: " + detalhes)

    if (invalidos.length > 0) {
        console.log("Dados inválidos ->", invalidos)
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
        await pool.query(
            `INSERT INTO orcamentos
             (nome, telefone, data, horario, status, tamanho, estilo, cor, regiao, detalhes, minimo, maximo)
             VALUES ($1, $2, $3, $4, 'pendente', $5, $6, $7, $8, $9, $10, $11)`,
            [nome, telefone, data, horario, tamanho, estilo, cor, regiao, detalhes, minimo, maximo]
        )
    } catch (erro) {
        // 23505 = a trava do banco recusou: alguém reservou esse horário primeiro
        if (erro.code === "23505") {
            return res.status(409).json({ erro: "Esse horário acabou de ser reservado. Escolha outro." })
        }
        throw erro
    }

    res.json({ minimo, maximo, numero: NUMERO_ESTUDIO, data, horario })
})

app.get("/api/admin/orcamentos", limiteAdmin, async (req, res) => {
    if (!adminAutorizado(req)) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const resultado = await pool.query("SELECT * FROM orcamentos ORDER BY id DESC LIMIT 100")
    res.json(resultado.rows)
})

app.patch("/api/admin/orcamentos/:id/status", limiteAdmin, async (req, res) => {
    if (!adminAutorizado(req)) {
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
        const resultado = await pool.query(
            "UPDATE orcamentos SET status = $1 WHERE id = $2",
            [status, id]
        )
        if (resultado.rowCount === 0) {
            return res.status(404).json({ erro: "Orçamento não encontrado." })
        }
    } catch (erro) {
        // reabrir um cancelado cujo horário já foi reservado por outro cliente
        if (erro.code === "23505") {
            return res.status(409).json({ erro: "Esse horário já foi reservado por outro cliente." })
        }
        throw erro
    }

    res.json({ ok: true })
})

app.get("/api/admin/orcamentos/:id/aviso", limiteAdmin, async (req, res) => {
    if (!adminAutorizado(req)) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "Orçamento inválido." })
    }

    const resultado = await pool.query("SELECT * FROM orcamentos WHERE id = $1", [id])
    const o = resultado.rows[0]

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
            "*Agendamento confirmado!*",
            "",
            "Olá, " + o.nome + "! Seu horário está garantido.",
            "",
            "*Data:* " + dataBR,
            "*Horário:* " + o.horario,
            "*Local:* " + endereco,
            "*Tatuador(a):* " + tatuador
        ]
        if (mapa) linhas.push(" *Mapa:*" + mapa)
        linhas.push("", "Qualquer dúvida é só responder por aqui. Até lá!")
    } else {
        linhas = [
            "Olá, " + o.nome + "!",
            "",
            "Infelizmente precisamos cancelar o agendamento de *" + dataBR + " às " + o.horario + "*.",
            "",
            "Se quiser, é só escolher outro horário pelo site, ou me responder por aqui que a gente combina.",
            "— " + tatuador
        ]
    }

    const link = "https://wa.me/55" + o.telefone + "?text=" + encodeURIComponent(linhas.join("\n"))
    res.json({ link })
})

// qualquer erro inesperado vira uma resposta limpa (sem vazar detalhes)
app.use((erro, req, res, next) => {
    console.error(erro)
    res.status(500).json({ erro: "Erro interno. Tente novamente." })
})

// prepara o banco antes de aceitar visitas
iniciar()
    .then(() => {
        app.listen(PORTA, () => {
            console.log(`Servidor rodando em http://localhost:${PORTA}`)
        })
    })
    .catch(erro => {
        console.error("Não foi possível preparar o banco:", erro.message)
        process.exit(1)
    })