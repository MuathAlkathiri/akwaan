import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

import type { QuestionFormData } from "./question-form-schema";

export interface QuestionFormSectionProps {
  control: Control<QuestionFormData>;
  register: UseFormRegister<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  values: QuestionFormData;
}