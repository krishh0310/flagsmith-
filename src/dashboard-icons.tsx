const paths = {
  comparison: 'M4 5h6v14H4z M14 5h6v14h-6z M4 10h6 M14 10h6',
  explorer: 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  risk: 'M3 14l5-5 5 4 6-8 M15 5h4v4 M3 20h18',
  external: 'M14 4h6v6 M20 4l-9 9 M11 6H5v13h13v-6',
  play: 'M7 4l13 8-13 8z',
  branch: 'M6 3v12a4 4 0 0 0 4 4h8 M6 8h6a4 4 0 0 0 4-4',
  report: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  flag: 'M5 21V4c5-3 9 4 14 0v9c-5 4-9-3-14 0',
  filter: 'M3 6h18 M6 12h12 M9 18h6',
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}
