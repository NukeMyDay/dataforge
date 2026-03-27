import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar.js";
import Footer from "./Footer.js";
import ChatWidget from "./ChatWidget.js";

interface Props {
  children: ReactNode;
}

function getSilo(pathname: string): "education" | "regulatory" | undefined {
  if (pathname.startsWith("/education") || pathname.startsWith("/institutions")) return "education";
  if (pathname.startsWith("/regulatory")) return "regulatory";
  return undefined;
}

export default function Layout({ children }: Props) {
  const { pathname } = useLocation();
  const silo = getSilo(pathname);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatWidget silo={silo} />
    </div>
  );
}
