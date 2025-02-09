"use client";

import {
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@nextui-org/react";
import { GithubIcon, HeyGenLogo } from "./Icons";

export default function NavBar() {
  return (
    <Navbar className="w-full" isBordered>
      <NavbarBrand>
        <Link href="/" className="flex items-center gap-2">
          <HeyGenLogo />
          <span className="hidden md:block text-xl font-semibold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            HeyGen Avatar
          </span>
        </Link>
      </NavbarBrand>
      
      <NavbarContent justify="end">
      </NavbarContent>
    </Navbar>
  );
}
