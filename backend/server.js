require("dotenv").config()

const db = require("./db")

const precos = require("./precos")

const express = require("express")

const path = require("path")

const app = express()



const PORTA = 3000

app.use(express.json())

app.use(express.static(path.join(__dirname, "public")))



app.get("/teste", (req, res) => {
    res.json({
        mensagem: "Olá! O backend está funcionando."
    })
})

const NUMERO_ESTUDIO = process.env.NUMERO_ESTUDIO

function arredondar(valor) {
    return Math.round(valor / 10) * 10
}

app.post("/api/orcamento", (req, res) => {
    const { estilo, cor, regiao, detalhes } = req.body
    const tamanho = Number(req.body.tamanho)
        const nome = String(req.body.nome || "").trim()
    const telefone = String(req.body.telefone || "").replace(/\D/g, "")

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
    if (!Object.hasOwn(precos.estilo, estilo) ||
        !Object.hasOwn(precos.cores, cor) ||
        !Object.hasOwn(precos.regiao, regiao) ||
        !Object.hasOwn(precos.detalhes, detalhes)) {
        return res.status(400).json({ erro: "Dados inválidos." })
    }

    // a mesma conta que estava no script.js
    const total =
        (precos.valorBase + tamanho * precos.valorPorCm) *
        precos.estilo[estilo] * precos.cores[cor] *
        precos.regiao[regiao] * precos.detalhes[detalhes]

    const minimo = Math.max(arredondar(total * (1 - precos.margem)), precos.valorMinimo)
    const maximo = Math.max(arredondar(total * (1 + precos.margem)), minimo)

           db.prepare(`
        INSERT INTO orcamentos (nome, telefone, tamanho, estilo, cor, regiao, detalhes, minimo, maximo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nome, telefone, tamanho, estilo, cor, regiao, detalhes, minimo, maximo)
    res.json({ minimo, maximo, numero: NUMERO_ESTUDIO })
})

app.get("/api/admin/orcamentos", (req, res) => {
    const token = req.get("x-admin-token")

    // se a senha não existir no .env ou estiver errada, bloqueia
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado." })
    }

    const lista = db.prepare("SELECT * FROM orcamentos ORDER BY id DESC LIMIT 100").all()
    res.json(lista)
})

app.listen(PORTA, () => {
    console.log(`Servidor rodando em http://localhost:${PORTA}`)
})