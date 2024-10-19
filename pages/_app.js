import '@/app/globals.css'
import localFont from "next/font/local"

const geistSans = localFont({
  src: "../app/fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})

const geistMono = localFont({
  src: "../app/fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

function MyApp({ Component, pageProps }) {
  return (
    <main className={`${geistSans.variable} ${geistMono.variable}`}>
      <Component {...pageProps} />
    </main>
  )
}

export default MyApp