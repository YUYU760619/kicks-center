"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

export type CreateVendorDraft = {
  code: string;
  name: string;
  phone: string;
  joined: string;
};

const emptyCreateVendorDraft: CreateVendorDraft = {
  code: "",
  name: "",
  phone: "",
  joined: "",
};

type AdminUiContextValue = {
  createVendorOpen: boolean;
  setCreateVendorOpen: (open: boolean) => void;
  createVendorDraft: CreateVendorDraft;
  setCreateVendorDraft: React.Dispatch<React.SetStateAction<CreateVendorDraft>>;
  clearCreateVendor: () => void;
};

const AdminUiContext = createContext<AdminUiContextValue | null>(null);

export function AdminUiProvider({ children }: { children: ReactNode }) {
  const [createVendorOpen, setCreateVendorOpen] = useState(false);
  const [createVendorDraft, setCreateVendorDraft] = useState<CreateVendorDraft>(
    emptyCreateVendorDraft,
  );

  function clearCreateVendor() {
    setCreateVendorOpen(false);
    setCreateVendorDraft(emptyCreateVendorDraft);
  }

  return (
    <AdminUiContext.Provider
      value={{
        createVendorOpen,
        setCreateVendorOpen,
        createVendorDraft,
        setCreateVendorDraft,
        clearCreateVendor,
      }}
    >
      {children}
    </AdminUiContext.Provider>
  );
}

export function useAdminUi() {
  const context = useContext(AdminUiContext);
  if (!context) throw new Error("Admin UI provider is missing");
  return context;
}
