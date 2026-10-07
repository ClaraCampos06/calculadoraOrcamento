const readline = require("readline")
const bcrypt = require("bcryptjs")
const { pool, iniciar } = require("./db")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function perguntar(texto) {
    return new Promise(resolve => rl.question(texto, resolve))
}

async function main() {
    await iniciar()   // garante que a tabela existe

    const nome = (await perguntar("Nome: ")).trim()
    const email = (await perguntar("E-mail: ")).trim().toLowerCase()
    const senha = await perguntar("Senha (mínimo 10 caracteres): ")
    rl.close()

    if (nome.length < 2) throw new Error("Nome muito curto.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.")
    if (senha.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.")

    // o 12 é o "custo": quanto maior, mais lento (e mais seguro) o hash
    const senhaHash = await bcrypt.hash(senha, 12)

    await pool.query(
        "INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, $3, 'admin')",
        [nome, email, senhaHash]
    )
    console.log("Usuário criado:", email)
}

main()
    .catch(erro => {
        if (erro.code === "23505") {
            console.error("Já existe um usuário com esse e-mail.")
        } else {
            console.error("Erro:", erro.message)
        }
    })
    .finally(() => pool.end())