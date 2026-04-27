import "./globals.css";
import { COMPANY } from "@/config/company";

export const metadata = {
  title: `${COMPANY.shortName || COMPANY.businessName} (Caixa + Agenda)`,
  description: "Controle de caixa, pagamentos e agendamentos",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  );
}
