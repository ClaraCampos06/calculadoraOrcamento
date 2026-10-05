const express = require("express")

const app = express()

const PORTA = 3000

app.use(express.json())

app.get("/", (req, res) => {
    res.send("Backend do InkBudget funcionando!")
})

app.get("/teste", (req, res) => {
    res.json({
        mensagem: "Olá! O backend está funcionando."
    })
})

app.listen(PORTA, () => {
    console.log(`Servidor rodando em http://localhost:${PORTA}`)
})