require("dotenv").config()

const db = require("./db")
const precos = require("./precos")
const agenda = require("./agenda")          // NOVO (passo 2)
const express = require("express")
const path = require("path")

const app = express()

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

// NOVO (passo 2): horários livres de um dia
app.get("/api/horarios", (req, res) => {
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

app.post("/api/orcamento", (req, res) => {
    const { estilo, cor, regiao, detalhes } = req.body
    const tamanho = Number(req.body.tamanho)
    const nome = String(req.body.nome || "").trim()
    const telefone = String(req.body.telefone || "").replace(/\D/g, "")
    const data = String(req.body.data || "")          // NOVO (passo 3)
    const horario = String(req.body.horario || "")    // NOVO (passo 3)

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

    // NOVO (passo 3): validar data e horário
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

    // NOVO (passo 3): gravar com data, horário e status
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

app.get("/api/admin/orcamentos", (req, res) => {
    const token = req.get("x-admin-token")

    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const lista = db.prepare("SELECT * FROM orcamentos ORDER BY id DESC LIMIT 100").all()
    res.json(lista)
})

app.patch("/api/admin/orcamentos/:id/status", (req, res) => {
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

app.listen(PORTA, () => {
    console.log(`Servidor rodando em http://localhost:${PORTA}`)
})