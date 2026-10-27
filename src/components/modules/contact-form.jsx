"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useUpdateMyContactMutation } from "@/store/api/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContactForm({ phone = "", address = "" }) {
  const [updateMyContact, { isLoading }] = useUpdateMyContactMutation();
  const [form, setForm] = React.useState({ phone, address });

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await updateMyContact({
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      }).unwrap();
      toast.success("Contact details updated!");
    } catch (err) {
      toast.error(err?.data?.error || "Update failed. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+92 300 1234567"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          placeholder="House / street / city"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Save className="size-4" /> Save changes
          </>
        )}
      </Button>
    </form>
  );
}
