const Database = require("better-sqlite3")
const path = require("path")

const db = new Database(path.join(__dirname, "orcamentos.db"))

db.exec(`
CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    tamanho REAL,
    estilo TEXT,
    cor TEXT,
    regiao TEXT,
    detalhes TEXT,
    minimo INTEGER,
    maximo INTEGER
)
`)

// adiciona as colunas novas (se já existirem, ignora o erro)
for (const coluna of ["nome TEXT", "telefone TEXT"]) {
    try {
        db.exec(`ALTER TABLE orcamentos ADD COLUMN ${coluna}`)
    } catch (erro) {
        // coluna já existe, segue o jogo
    }
}

module.exports = db