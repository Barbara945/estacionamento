import AccountsPayableScreen from "@/components/AccountsPayableScreen";

export default function Page() {
  return (
    <AccountsPayableScreen
      title="Contas Particulares"
      subtitle="Contas pessoais (não mistura com as contas da empresa). Não lança no Caixa."
      defaultScope="Particular"
      lockScope={true}
      enableCashPosting={false}
    />
  );
}
