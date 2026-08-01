export const PASSWORD_MIN_LENGTH = 8;

export type PasswordPolicyResult = {
  isValid: boolean;
  message: string;
};

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      isValid: false,
      message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins une lettre minuscule.',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins une lettre majuscule.',
    };
  }

  if (!/\d/.test(password)) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins un chiffre.',
    };
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins un caractère spécial.',
    };
  }

  return {
    isValid: true,
    message: '',
  };
}

export const PASSWORD_POLICY_HELP =
  '8 caractères minimum, avec une minuscule, une majuscule, un chiffre et un caractère spécial.';
