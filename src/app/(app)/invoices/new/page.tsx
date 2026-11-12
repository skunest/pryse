"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { PageHeader } from "@/components/ui";

function NewInvoice() {
  const sp = useSearchParams();
  return (
    <>
      <PageHeader back={{ href: "/invoices", label: "Invoices" }} title="New invoice" />
      <InvoiceEditor presetClient={sp.get("client")} />
    </>
  );
}

export default function Page() {
  return <Suspense><NewInvoice /></Suspense>;
}
