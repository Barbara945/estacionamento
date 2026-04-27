"use client";

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <div className="h1">{title}</div>
            <div className="small">Preencha e clique em salvar</div>
          </div>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
        <div className="divider" />
        {children}
      </div>
    </div>
  );
}
