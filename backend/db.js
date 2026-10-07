require("dotenv").config()
const { Pool } = require("pg")

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// cria as tabelas e a trava de horário (se ainda não existirem)
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

    // usuários que podem entrar no painel
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            criado_em TIMESTAMPTZ DEFAULT NOW(),
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            papel TEXT NOT NULL DEFAULT 'admin'
        )
    `)
}

module.exports = { pool, iniciar }