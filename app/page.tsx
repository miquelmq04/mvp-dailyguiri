import Image from "next/image";

export default function Home() {
  return process.env.APP_VERSION || "Hola";
}
