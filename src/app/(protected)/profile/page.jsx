import Link from "next/link";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/guards";
import { redirect } from "next/navigation";
import { AnimatedContent } from "@/components/react-bits/animated-content";
import { ContactForm } from "@/components/modules/contact-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { profile, employee } = session;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <AnimatedContent>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight">My Profile</h2>
          <p className="text-sm text-muted-foreground">
            Account details aur apni contact information.
          </p>
        </div>
      </AnimatedContent>

      <div className="grid gap-4 md:grid-cols-2">
        <AnimatedContent delay={0.05}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Login identity aur role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{profile.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                  <Badge variant="secondary" className="uppercase tracking-wide">
                    {profile.role}
                  </Badge>
                  {employee ? (
                    <span className="text-xs text-muted-foreground">
                      {employee.code} · {employee.full_name}
                    </span>
                  ) : null}
                </div>
              </div>
              <Separator />
              <Button asChild variant="outline" size="sm">
                <Link href="/change-password">
                  <KeyRound className="size-4" /> Change password
                </Link>
              </Button>
            </CardContent>
          </Card>
        </AnimatedContent>

        <AnimatedContent delay={0.1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
              <CardDescription>
                Sirf phone aur address edit hota hai — baqi details HR manage karta hai.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employee ? (
                <ContactForm phone={employee.phone ?? ""} address={employee.address ?? ""} />
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Aap ke account se koi employee record linked nahi hai (Admin/HR
                  accounts). Directory Phase 3 me aayegi jahan se details manage
                  hongi.
                </p>
              )}
            </CardContent>
          </Card>
        </AnimatedContent>
      </div>
    </div>
  );
}
