"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, InputProps } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className="pl-11"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        onClick={() => setVisible((current) => !current)}
        className="absolute left-1 top-1 h-8 w-8 p-0"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
