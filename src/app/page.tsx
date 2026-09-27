import { connection } from "next/server";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { memberCount } from "@/lib/data";

export default async function Home() {
  await connection(); // read the database on every request, not once at build time
  if ((await memberCount()) === 0) redirect("/setup");
  redirect((await currentMember()) ? "/today" : "/login");
}
