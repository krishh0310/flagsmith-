export const profiles = {
  'free-latest': { plan: 'free', app_version: 2 },
  'paid-latest': { plan: 'paid', app_version: 2 },
  'paid-older': { plan: 'paid', app_version: 1 },
};

export type Profile = keyof typeof profiles;
export const profileIds = Object.keys(profiles) as Profile[];
