import type {Metadata} from "next";
import { AppLogo } from "@/components/brand/app-logo";
import { LoginForm } from "@/components/forms/login-form";
export const metadata:Metadata={title:"Sign in",robots:{index:false,follow:false}};
export default function LoginPage(){return <main id="main-content" className="grid min-h-screen place-items-center px-5 py-10"><section className="glass-feature w-full max-w-md rounded-2xl p-7 md:p-10"><AppLogo className="mb-10"/><h1 className="font-display text-4xl font-semibold">Welcome back</h1><p className="mb-8 mt-3 leading-7 text-graphite">Sign in to your approved applicant or staff workspace.</p><LoginForm/><p className="mt-8 text-center text-sm text-muted-foreground">Need help? <a className="text-antique-gold underline" href="mailto:info@gbeaward.com">info@gbeaward.com</a></p></section></main>}
