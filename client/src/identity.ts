const COLORS = [
  '#e74c3c', '#8e44ad', '#3498db', '#1abc9c', '#f1c40f', '#e67e22', '#2ecc71',
];

const ADJECTIVES = ['Ancient', 'Creative', 'Dangerous', 'Effective', 'Flying', 'Gilded', 'Hyper', 'Incredible', 'Joyful'];
const ANIMALS = ['Bear', 'Capybara', 'Dingo', 'Eagle', 'Falcon', 'Goat', 'Hamster', 'Iguana', 'Jaguar'];

export interface UserIdentity {
  name: string;
  color: string;
}

export function generateIdentity(clientId: number): UserIdentity {
  const color = COLORS[clientId % COLORS.length];
  const adj = ADJECTIVES[clientId % ADJECTIVES.length];
  const animal = ANIMALS[(clientId * 3) % ANIMALS.length];
  return { name: `${adj} ${animal}`, color };
}
