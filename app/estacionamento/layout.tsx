export default function LayoutEstacionamento({ children }) {
  return (
    <div style={container}>
      
      {/* 🔝 TOPO */}
      <div style={topbar}>
        
        {/* LOGO + NOME */}
        <div style={logoArea}>
          <div style={logo}>🚗</div>

          <div>
            <div style={titulo}>ANC ESTACIONAMENTO</div>
          </div>
        </div>

        {/* MENU */}
        <div style={menu}>
          <a href="/estacionamento" style={menuItem}>Dashboard</a>
          <a href="/estacionamento/clientes" style={menuItem}>Clientes</a>
          <a href="/estacionamento/financeiro" style={menuItem}>Pagamentos</a>
          <a href="/estacionamento/configuracoes" style={menuItem}>Configurações</a>
        </div>

        {/* USUÁRIO */}
        <div style={user}>
          <span style={{ marginRight: 10 }}>Usuário</span>
          <button style={btnSair}>Sair</button>
        </div>

      </div>

      {/* 📦 CONTEÚDO */}
      <div style={content}>
        {children}
      </div>

    </div>
  );
}

/* 🎨 ESTILO */

const container = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f172a, #1e293b)",
  color: "#fff",
  fontFamily: "Arial, sans-serif",
};

const topbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "15px 30px",
  background: "#111827",
  borderBottom: "1px solid #1f2937",
};

const logoArea = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const logo = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "#1f2937",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
};

const titulo = {
  fontWeight: "bold",
  fontSize: 14,
};

const menu = {
  display: "flex",
  gap: 15,
};

const menuItem = {
  color: "#cbd5f5",
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: 6,
  background: "#1f2937",
};

const user = {
  display: "flex",
  alignItems: "center",
};

const btnSair = {
  background: "#ef4444",
  color: "#fff",
  border: "none",
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
};

const content = {
  padding: 30,
};