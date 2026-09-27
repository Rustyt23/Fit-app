import { connection } from "next/server";
import { redirect } from "next/navigation";
import { memberCount } from "@/lib/data";
import { setupFamily } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import PhotoPicker from "@/components/PhotoPicker";

export default async function SetupPage() {
  await connection(); // read the database on every request, not once at build time
  if ((await memberCount()) > 0) redirect("/login");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mb-3 text-5xl">🏡💪</div>
        <h1 className="text-3xl font-black">Welcome to Family Fit</h1>
        <p className="mt-2 text-muted">
          Let&apos;s set up your family. You&apos;ll be the admin: you add family members and give each one their routine.
        </p>
      </div>

      <ActionForm action={setupFamily} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="family">Family name</label>
          <input id="family" name="family" className="field" placeholder="e.g. The Fit Family" maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" className="field" placeholder="e.g. Dad" required maxLength={40} />
        </div>
        <div>
          <span className="label">Your photo</span>
          <PhotoPicker />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pin">PIN (optional)</label>
            <input id="pin" name="pin" className="field tracking-[0.4em]" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} placeholder="0000" />
          </div>
          <div>
            <label className="label" htmlFor="pin2">Repeat PIN</label>
            <input id="pin2" name="pin2" className="field tracking-[0.4em]" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} placeholder="0000" />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-muted">Leave both empty to use 0000 for now. You can change it later from “Me”.</p>
        </div>
        <SubmitButton className="btn w-full text-lg" pendingText="Setting up…">
          Create our family
        </SubmitButton>
      </ActionForm>
    </main>
  );
}
