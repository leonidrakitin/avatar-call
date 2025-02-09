"use client";

import {
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@nextui-org/react";
import { GithubIcon, HeyGenLogo } from "./Icons";
import { ThemeSwitch } from "./ThemeSwitch";

export default function NavBar() {
  return (
    <Navbar className="w-full">
      <NavbarBrand>
        <Link isExternal aria-label="HeyGen" href="https://app.heygen.com/">
          <HeyGenLogo />
        </Link>
        <div className="bg-gradient-to-br from-sky-300 to-indigo-500 bg-clip-text ml-4">
          <p className="text-xl font-semibold text-transparent">
            HeyGen Interactive Jenyas Avatar Demo
          </p>
        </div>
      </NavbarBrand>
    </Navbar>
  );
}
