require("dotenv").config()
const { Pool } = require("pg")

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// cria a tabela e a trava de horário (se ainda não existirem)
async function iniciar() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS orcamentos (
            id SERIAL PRIMARY KEY,
            criado_em TIMESTAMPTZ DEFAULT NOW(),
            nome TEXT,
            telefone TEXT,
            data TEXT,
            horario TEXT,
            status TEXT DEFAULT 'pendente',
            tamanho REAL,
            estilo TEXT,
            cor TEXT,
            regiao TEXT,
            detalhes TEXT,
            minimo INTEGER,
            maximo INTEGER
        )
    `)

    // trava: não deixa dois agendamentos no mesmo dia e horário
    // (cancelados não contam, então o horário volta a ficar livre)
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS horario_unico
        ON orcamentos (data, horario)
        WHERE status <> 'cancelado' AND data IS NOT NULL
    `)
}

module.exports = { pool, iniciar }