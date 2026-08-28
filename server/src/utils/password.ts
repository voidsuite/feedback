export function checkPasswordStrength(password: string): { score: number; warning: string } {
  let score = 0;
  const warnings: string[] = [];
  if (password.length < 8) warnings.push('Too short');
  else score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 16) score++;
  return { score: Math.min(score, 4), warning: warnings.join(', ') || (score < 2 ? 'Weak password' : score < 3 ? 'Fair password' : '') };
}
