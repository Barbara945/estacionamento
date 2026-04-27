import AccountsPayableScreen from "@/components/AccountsPayableScreen";

export default function Page() {
  return (
    <AccountsPayableScreen
      title="Contas a Pagar (Empresa)"
      subtitle="Cadastre despesas da empresa e lance no Caixa ao marcar como Pago"
      defaultScope="Empresa"
      lockScope={true}
    />
  );
}
