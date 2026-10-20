import { createContext, useEffect, useState } from "react";
import InterstormLogo from "./media/logo/anything-llm.png";
import System from "./models/system";

export const REFETCH_LOGO_EVENT = "refetch-logo";

export const LogoContext = createContext();

export function LogoProvider({ children }) {
  const [logo, setLogo] = useState("");
  const [loginLogo, setLoginLogo] = useState("");
  const [isCustomLogo, setIsCustomLogo] = useState(false);

  async function fetchInstanceLogo() {
    try {
      const { isCustomLogo, logoURL } = await System.fetchLogo();
      if (logoURL) {
        setLogo(logoURL);
        setLoginLogo(isCustomLogo ? logoURL : InterstormLogo);
        setIsCustomLogo(isCustomLogo);
      } else {
        setLogo(InterstormLogo);
        setLoginLogo(InterstormLogo);
        setIsCustomLogo(false);
      }
    } catch (err) {
      setLogo(InterstormLogo);
      setLoginLogo(InterstormLogo);
      setIsCustomLogo(false);
      console.error("Failed to fetch logo:", err);
    }
  }

  useEffect(() => {
    fetchInstanceLogo();
    window.addEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
    return () => {
      window.removeEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
    };
  }, []);

  return (
    <LogoContext.Provider value={{ logo, setLogo, loginLogo, isCustomLogo }}>
      {children}
    </LogoContext.Provider>
  );
}
