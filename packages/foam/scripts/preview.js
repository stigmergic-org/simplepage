import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateFoamSvg } from '../src/foam.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)
const rawCount = Number.parseInt(args[0] ?? '30', 30)
const rawSize = Number.parseInt(args[1] ?? '124', 10)
const count = Number.isFinite(rawCount) ? Math.max(1, rawCount) : 10
const size = Number.isFinite(rawSize) ? Math.max(64, rawSize) : 124
const outputDir = path.resolve(__dirname, '..', 'preview')

const previewThemes = [
  {
    name: 'cupcake',
    css: `color-scheme: light;
--color-base-100: oklch(97.788% 0.004 56.375);
--color-base-200: oklch(93.982% 0.007 61.449);
--color-base-300: oklch(91.586% 0.006 53.44);
--color-base-content: oklch(23.574% 0.066 313.189);
--color-primary: oklch(85% 0.138 181.071);
--color-primary-content: oklch(43% 0.078 188.216);
--color-secondary: oklch(89% 0.061 343.231);
--color-secondary-content: oklch(45% 0.187 3.815);
--color-accent: oklch(90% 0.076 70.697);
--color-accent-content: oklch(47% 0.157 37.304);
--color-neutral: oklch(27% 0.006 286.033);
--color-neutral-content: oklch(92% 0.004 286.32);
--color-info: oklch(68% 0.169 237.323);
--color-info-content: oklch(29% 0.066 243.157);
--color-success: oklch(69% 0.17 162.48);
--color-success-content: oklch(26% 0.051 172.552);
--color-warning: oklch(79% 0.184 86.047);
--color-warning-content: oklch(28% 0.066 53.813);
--color-error: oklch(64% 0.246 16.439);
--color-error-content: oklch(27% 0.105 12.094);
--radius-selector: 1rem;
--radius-field: 2rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 2px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'emerald',
    css: `color-scheme: light;
--color-base-100: oklch(100% 0 0);
--color-base-200: oklch(93% 0 0);
--color-base-300: oklch(86% 0 0);
--color-base-content: oklch(35.519% 0.032 262.988);
--color-primary: oklch(76.662% 0.135 153.45);
--color-primary-content: oklch(33.387% 0.04 162.24);
--color-secondary: oklch(61.302% 0.202 261.294);
--color-secondary-content: oklch(100% 0 0);
--color-accent: oklch(72.772% 0.149 33.2);
--color-accent-content: oklch(0% 0 0);
--color-neutral: oklch(35.519% 0.032 262.988);
--color-neutral-content: oklch(98.462% 0.001 247.838);
--color-info: oklch(72.06% 0.191 231.6);
--color-info-content: oklch(0% 0 0);
--color-success: oklch(64.8% 0.15 160);
--color-success-content: oklch(0% 0 0);
--color-warning: oklch(84.71% 0.199 83.87);
--color-warning-content: oklch(0% 0 0);
--color-error: oklch(71.76% 0.221 22.18);
--color-error-content: oklch(0% 0 0);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'corporate',
    css: `color-scheme: light;
--color-base-100: oklch(100% 0 0);
--color-base-200: oklch(93% 0 0);
--color-base-300: oklch(86% 0 0);
--color-base-content: oklch(22.389% 0.031 278.072);
--color-primary: oklch(58% 0.158 241.966);
--color-primary-content: oklch(100% 0 0);
--color-secondary: oklch(55% 0.046 257.417);
--color-secondary-content: oklch(100% 0 0);
--color-accent: oklch(60% 0.118 184.704);
--color-accent-content: oklch(100% 0 0);
--color-neutral: oklch(0% 0 0);
--color-neutral-content: oklch(100% 0 0);
--color-info: oklch(60% 0.126 221.723);
--color-info-content: oklch(100% 0 0);
--color-success: oklch(62% 0.194 149.214);
--color-success-content: oklch(100% 0 0);
--color-warning: oklch(85% 0.199 91.936);
--color-warning-content: oklch(0% 0 0);
--color-error: oklch(70% 0.191 22.216);
--color-error-content: oklch(0% 0 0);
--radius-selector: 0.25rem;
--radius-field: 0.25rem;
--radius-box: 0.25rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'synthwave',
    css: `color-scheme: dark;
--color-base-100: oklch(15% 0.09 281.288);
--color-base-200: oklch(20% 0.09 281.288);
--color-base-300: oklch(25% 0.09 281.288);
--color-base-content: oklch(78% 0.115 274.713);
--color-primary: oklch(71% 0.202 349.761);
--color-primary-content: oklch(28% 0.109 3.907);
--color-secondary: oklch(82% 0.111 230.318);
--color-secondary-content: oklch(29% 0.066 243.157);
--color-accent: oklch(75% 0.183 55.934);
--color-accent-content: oklch(26% 0.079 36.259);
--color-neutral: oklch(45% 0.24 277.023);
--color-neutral-content: oklch(87% 0.065 274.039);
--color-info: oklch(74% 0.16 232.661);
--color-info-content: oklch(29% 0.066 243.157);
--color-success: oklch(77% 0.152 181.912);
--color-success-content: oklch(27% 0.046 192.524);
--color-warning: oklch(90% 0.182 98.111);
--color-warning-content: oklch(42% 0.095 57.708);
--color-error: oklch(73.7% 0.121 32.639);
--color-error-content: oklch(23.501% 0.096 290.329);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'retro',
    css: `color-scheme: light;
--color-base-100: oklch(91.637% 0.034 90.515);
--color-base-200: oklch(88.272% 0.049 91.774);
--color-base-300: oklch(84.133% 0.065 90.856);
--color-base-content: oklch(41% 0.112 45.904);
--color-primary: oklch(80% 0.114 19.571);
--color-primary-content: oklch(39% 0.141 25.723);
--color-secondary: oklch(92% 0.084 155.995);
--color-secondary-content: oklch(44% 0.119 151.328);
--color-accent: oklch(68% 0.162 75.834);
--color-accent-content: oklch(41% 0.112 45.904);
--color-neutral: oklch(44% 0.011 73.639);
--color-neutral-content: oklch(86% 0.005 56.366);
--color-info: oklch(58% 0.158 241.966);
--color-info-content: oklch(96% 0.059 95.617);
--color-success: oklch(51% 0.096 186.391);
--color-success-content: oklch(96% 0.059 95.617);
--color-warning: oklch(64% 0.222 41.116);
--color-warning-content: oklch(96% 0.059 95.617);
--color-error: oklch(70% 0.191 22.216);
--color-error-content: oklch(40% 0.123 38.172);
--radius-selector: 0.25rem;
--radius-field: 0.25rem;
--radius-box: 0.5rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'cyberpunk',
    css: `color-scheme: light;
--color-base-100: oklch(94.51% 0.179 104.32);
--color-base-200: oklch(91.51% 0.179 104.32);
--color-base-300: oklch(85.51% 0.179 104.32);
--color-base-content: oklch(0% 0 0);
--color-primary: oklch(74.22% 0.209 6.35);
--color-primary-content: oklch(14.844% 0.041 6.35);
--color-secondary: oklch(83.33% 0.184 204.72);
--color-secondary-content: oklch(16.666% 0.036 204.72);
--color-accent: oklch(71.86% 0.217 310.43);
--color-accent-content: oklch(14.372% 0.043 310.43);
--color-neutral: oklch(23.04% 0.065 269.31);
--color-neutral-content: oklch(94.51% 0.179 104.32);
--color-info: oklch(72.06% 0.191 231.6);
--color-info-content: oklch(0% 0 0);
--color-success: oklch(64.8% 0.15 160);
--color-success-content: oklch(0% 0 0);
--color-warning: oklch(84.71% 0.199 83.87);
--color-warning-content: oklch(0% 0 0);
--color-error: oklch(71.76% 0.221 22.18);
--color-error-content: oklch(0% 0 0);
--radius-selector: 0rem;
--radius-field: 0rem;
--radius-box: 0rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'valentine',
    css: `color-scheme: light;
--color-base-100: oklch(97% 0.014 343.198);
--color-base-200: oklch(94% 0.028 342.258);
--color-base-300: oklch(89% 0.061 343.231);
--color-base-content: oklch(52% 0.223 3.958);
--color-primary: oklch(65% 0.241 354.308);
--color-primary-content: oklch(100% 0 0);
--color-secondary: oklch(62% 0.265 303.9);
--color-secondary-content: oklch(97% 0.014 308.299);
--color-accent: oklch(82% 0.111 230.318);
--color-accent-content: oklch(39% 0.09 240.876);
--color-neutral: oklch(40% 0.153 2.432);
--color-neutral-content: oklch(89% 0.061 343.231);
--color-info: oklch(86% 0.127 207.078);
--color-info-content: oklch(44% 0.11 240.79);
--color-success: oklch(84% 0.143 164.978);
--color-success-content: oklch(43% 0.095 166.913);
--color-warning: oklch(75% 0.183 55.934);
--color-warning-content: oklch(26% 0.079 36.259);
--color-error: oklch(63% 0.237 25.331);
--color-error-content: oklch(97% 0.013 17.38);
--radius-selector: 1rem;
--radius-field: 2rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'halloween',
    css: `color-scheme: dark;
--color-base-100: oklch(21% 0.006 56.043);
--color-base-200: oklch(14% 0.004 49.25);
--color-base-300: oklch(0% 0 0);
--color-base-content: oklch(84.955% 0 0);
--color-primary: oklch(77.48% 0.204 60.62);
--color-primary-content: oklch(19.693% 0.004 196.779);
--color-secondary: oklch(45.98% 0.248 305.03);
--color-secondary-content: oklch(89.196% 0.049 305.03);
--color-accent: oklch(64.8% 0.223 136.073);
--color-accent-content: oklch(0% 0 0);
--color-neutral: oklch(24.371% 0.046 65.681);
--color-neutral-content: oklch(84.874% 0.009 65.681);
--color-info: oklch(54.615% 0.215 262.88);
--color-info-content: oklch(90.923% 0.043 262.88);
--color-success: oklch(62.705% 0.169 149.213);
--color-success-content: oklch(12.541% 0.033 149.213);
--color-warning: oklch(66.584% 0.157 58.318);
--color-warning-content: oklch(13.316% 0.031 58.318);
--color-error: oklch(65.72% 0.199 27.33);
--color-error-content: oklch(13.144% 0.039 27.33);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'forest',
    css: `color-scheme: dark;
--color-base-100: oklch(20.84% 0.008 17.911);
--color-base-200: oklch(18.522% 0.007 17.911);
--color-base-300: oklch(16.203% 0.007 17.911);
--color-base-content: oklch(83.768% 0.001 17.911);
--color-primary: oklch(68.628% 0.185 148.958);
--color-primary-content: oklch(0% 0 0);
--color-secondary: oklch(69.776% 0.135 168.327);
--color-secondary-content: oklch(13.955% 0.027 168.327);
--color-accent: oklch(70.628% 0.119 185.713);
--color-accent-content: oklch(14.125% 0.023 185.713);
--color-neutral: oklch(30.698% 0.039 171.364);
--color-neutral-content: oklch(86.139% 0.007 171.364);
--color-info: oklch(72.06% 0.191 231.6);
--color-info-content: oklch(0% 0 0);
--color-success: oklch(64.8% 0.15 160);
--color-success-content: oklch(0% 0 0);
--color-warning: oklch(84.71% 0.199 83.87);
--color-warning-content: oklch(0% 0 0);
--color-error: oklch(71.76% 0.221 22.18);
--color-error-content: oklch(0% 0 0);
--radius-selector: 1rem;
--radius-field: 2rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'aqua',
    css: `color-scheme: dark;
--color-base-100: oklch(37% 0.146 265.522);
--color-base-200: oklch(28% 0.091 267.935);
--color-base-300: oklch(22% 0.091 267.935);
--color-base-content: oklch(90% 0.058 230.902);
--color-primary: oklch(85.661% 0.144 198.645);
--color-primary-content: oklch(40.124% 0.068 197.603);
--color-secondary: oklch(60.682% 0.108 309.782);
--color-secondary-content: oklch(96% 0.016 293.756);
--color-accent: oklch(93.426% 0.102 94.555);
--color-accent-content: oklch(18.685% 0.02 94.555);
--color-neutral: oklch(27% 0.146 265.522);
--color-neutral-content: oklch(80% 0.146 265.522);
--color-info: oklch(54.615% 0.215 262.88);
--color-info-content: oklch(90.923% 0.043 262.88);
--color-success: oklch(62.705% 0.169 149.213);
--color-success-content: oklch(12.541% 0.033 149.213);
--color-warning: oklch(66.584% 0.157 58.318);
--color-warning-content: oklch(27% 0.077 45.635);
--color-error: oklch(73.95% 0.19 27.33);
--color-error-content: oklch(14.79% 0.038 27.33);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'luxury',
    css: `color-scheme: dark;
--color-base-100: oklch(14.076% 0.004 285.822);
--color-base-200: oklch(20.219% 0.004 308.229);
--color-base-300: oklch(23.219% 0.004 308.229);
--color-base-content: oklch(75.687% 0.123 76.89);
--color-primary: oklch(100% 0 0);
--color-primary-content: oklch(20% 0 0);
--color-secondary: oklch(27.581% 0.064 261.069);
--color-secondary-content: oklch(85.516% 0.012 261.069);
--color-accent: oklch(36.674% 0.051 338.825);
--color-accent-content: oklch(87.334% 0.01 338.825);
--color-neutral: oklch(24.27% 0.057 59.825);
--color-neutral-content: oklch(93.203% 0.089 90.861);
--color-info: oklch(79.061% 0.121 237.133);
--color-info-content: oklch(15.812% 0.024 237.133);
--color-success: oklch(78.119% 0.192 132.154);
--color-success-content: oklch(15.623% 0.038 132.154);
--color-warning: oklch(86.127% 0.136 102.891);
--color-warning-content: oklch(17.225% 0.027 102.891);
--color-error: oklch(71.753% 0.176 22.568);
--color-error-content: oklch(14.35% 0.035 22.568);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'dracula',
    css: `color-scheme: dark;
--color-base-100: oklch(28.822% 0.022 277.508);
--color-base-200: oklch(26.805% 0.02 277.508);
--color-base-300: oklch(24.787% 0.019 277.508);
--color-base-content: oklch(97.747% 0.007 106.545);
--color-primary: oklch(75.461% 0.183 346.812);
--color-primary-content: oklch(15.092% 0.036 346.812);
--color-secondary: oklch(74.202% 0.148 301.883);
--color-secondary-content: oklch(14.84% 0.029 301.883);
--color-accent: oklch(83.392% 0.124 66.558);
--color-accent-content: oklch(16.678% 0.024 66.558);
--color-neutral: oklch(39.445% 0.032 275.524);
--color-neutral-content: oklch(87.889% 0.006 275.524);
--color-info: oklch(88.263% 0.093 212.846);
--color-info-content: oklch(17.652% 0.018 212.846);
--color-success: oklch(87.099% 0.219 148.024);
--color-success-content: oklch(17.419% 0.043 148.024);
--color-warning: oklch(95.533% 0.134 112.757);
--color-warning-content: oklch(19.106% 0.026 112.757);
--color-error: oklch(68.22% 0.206 24.43);
--color-error-content: oklch(13.644% 0.041 24.43);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'night',
    css: `color-scheme: dark;
--color-base-100: oklch(20.768% 0.039 265.754);
--color-base-200: oklch(19.314% 0.037 265.754);
--color-base-300: oklch(17.86% 0.034 265.754);
--color-base-content: oklch(84.153% 0.007 265.754);
--color-primary: oklch(75.351% 0.138 232.661);
--color-primary-content: oklch(15.07% 0.027 232.661);
--color-secondary: oklch(68.011% 0.158 276.934);
--color-secondary-content: oklch(13.602% 0.031 276.934);
--color-accent: oklch(72.36% 0.176 350.048);
--color-accent-content: oklch(14.472% 0.035 350.048);
--color-neutral: oklch(27.949% 0.036 260.03);
--color-neutral-content: oklch(85.589% 0.007 260.03);
--color-info: oklch(68.455% 0.148 237.251);
--color-info-content: oklch(0% 0 0);
--color-success: oklch(78.452% 0.132 181.911);
--color-success-content: oklch(15.69% 0.026 181.911);
--color-warning: oklch(83.242% 0.139 82.95);
--color-warning-content: oklch(16.648% 0.027 82.95);
--color-error: oklch(71.785% 0.17 13.118);
--color-error-content: oklch(14.357% 0.034 13.118);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'coffee',
    css: `color-scheme: dark;
--color-base-100: oklch(24% 0.023 329.708);
--color-base-200: oklch(21% 0.021 329.708);
--color-base-300: oklch(16% 0.019 329.708);
--color-base-content: oklch(72.354% 0.092 79.129);
--color-primary: oklch(71.996% 0.123 62.756);
--color-primary-content: oklch(14.399% 0.024 62.756);
--color-secondary: oklch(34.465% 0.029 199.194);
--color-secondary-content: oklch(86.893% 0.005 199.194);
--color-accent: oklch(42.621% 0.074 224.389);
--color-accent-content: oklch(88.524% 0.014 224.389);
--color-neutral: oklch(16.51% 0.015 326.261);
--color-neutral-content: oklch(83.302% 0.003 326.261);
--color-info: oklch(79.49% 0.063 184.558);
--color-info-content: oklch(15.898% 0.012 184.558);
--color-success: oklch(74.722% 0.072 131.116);
--color-success-content: oklch(14.944% 0.014 131.116);
--color-warning: oklch(88.15% 0.14 87.722);
--color-warning-content: oklch(17.63% 0.028 87.722);
--color-error: oklch(77.318% 0.128 31.871);
--color-error-content: oklch(15.463% 0.025 31.871);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'winter',
    css: `color-scheme: light;
--color-base-100: oklch(100% 0 0);
--color-base-200: oklch(97.466% 0.011 259.822);
--color-base-300: oklch(93.268% 0.016 262.751);
--color-base-content: oklch(41.886% 0.053 255.824);
--color-primary: oklch(56.86% 0.255 257.57);
--color-primary-content: oklch(91.372% 0.051 257.57);
--color-secondary: oklch(42.551% 0.161 282.339);
--color-secondary-content: oklch(88.51% 0.032 282.339);
--color-accent: oklch(59.939% 0.191 335.171);
--color-accent-content: oklch(11.988% 0.038 335.171);
--color-neutral: oklch(19.616% 0.063 257.651);
--color-neutral-content: oklch(83.923% 0.012 257.651);
--color-info: oklch(88.127% 0.085 214.515);
--color-info-content: oklch(17.625% 0.017 214.515);
--color-success: oklch(80.494% 0.077 197.823);
--color-success-content: oklch(16.098% 0.015 197.823);
--color-warning: oklch(89.172% 0.045 71.47);
--color-warning-content: oklch(17.834% 0.009 71.47);
--color-error: oklch(73.092% 0.11 20.076);
--color-error-content: oklch(14.618% 0.022 20.076);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'nord',
    css: `color-scheme: light;
--color-base-100: oklch(95.127% 0.007 260.731);
--color-base-200: oklch(93.299% 0.01 261.788);
--color-base-300: oklch(89.925% 0.016 262.749);
--color-base-content: oklch(32.437% 0.022 264.182);
--color-primary: oklch(59.435% 0.077 254.027);
--color-primary-content: oklch(11.887% 0.015 254.027);
--color-secondary: oklch(69.651% 0.059 248.687);
--color-secondary-content: oklch(13.93% 0.011 248.687);
--color-accent: oklch(77.464% 0.062 217.469);
--color-accent-content: oklch(15.492% 0.012 217.469);
--color-neutral: oklch(45.229% 0.035 264.131);
--color-neutral-content: oklch(89.925% 0.016 262.749);
--color-info: oklch(69.207% 0.062 332.664);
--color-info-content: oklch(13.841% 0.012 332.664);
--color-success: oklch(76.827% 0.074 131.063);
--color-success-content: oklch(15.365% 0.014 131.063);
--color-warning: oklch(85.486% 0.089 84.093);
--color-warning-content: oklch(17.097% 0.017 84.093);
--color-error: oklch(60.61% 0.12 15.341);
--color-error-content: oklch(12.122% 0.024 15.341);
--radius-selector: 1rem;
--radius-field: 0.25rem;
--radius-box: 0.5rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'sunset',
    css: `color-scheme: dark;
--color-base-100: oklch(22% 0.019 237.69);
--color-base-200: oklch(20% 0.019 237.69);
--color-base-300: oklch(18% 0.019 237.69);
--color-base-content: oklch(77.383% 0.043 245.096);
--color-primary: oklch(74.703% 0.158 39.947);
--color-primary-content: oklch(14.94% 0.031 39.947);
--color-secondary: oklch(72.537% 0.177 2.72);
--color-secondary-content: oklch(14.507% 0.035 2.72);
--color-accent: oklch(71.294% 0.166 299.844);
--color-accent-content: oklch(14.258% 0.033 299.844);
--color-neutral: oklch(26% 0.019 237.69);
--color-neutral-content: oklch(70% 0.019 237.69);
--color-info: oklch(85.559% 0.085 206.015);
--color-info-content: oklch(17.111% 0.017 206.015);
--color-success: oklch(85.56% 0.085 144.778);
--color-success-content: oklch(17.112% 0.017 144.778);
--color-warning: oklch(85.569% 0.084 74.427);
--color-warning-content: oklch(17.113% 0.016 74.427);
--color-error: oklch(85.511% 0.078 16.886);
--color-error-content: oklch(17.102% 0.015 16.886);
--radius-selector: 1rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;`,
  },
  {
    name: 'abyss',
    css: `color-scheme: dark;
--color-base-100: oklch(20% 0.08 209);
--color-base-200: oklch(15% 0.08 209);
--color-base-300: oklch(10% 0.08 209);
--color-base-content: oklch(90% 0.076 70.697);
--color-primary: oklch(92% 0.2653 125);
--color-primary-content: oklch(50% 0.2653 125);
--color-secondary: oklch(83.27% 0.0764 298.3);
--color-secondary-content: oklch(43.27% 0.0764 298.3);
--color-accent: oklch(43% 0 0);
--color-accent-content: oklch(98% 0 0);
--color-neutral: oklch(30% 0.08 209);
--color-neutral-content: oklch(90% 0.076 70.697);
--color-info: oklch(74% 0.16 232.661);
--color-info-content: oklch(29% 0.066 243.157);
--color-success: oklch(79% 0.209 151.711);
--color-success-content: oklch(26% 0.065 152.934);
--color-warning: oklch(84.8% 0.1962 84.62);
--color-warning-content: oklch(44.8% 0.1962 84.62);
--color-error: oklch(65% 0.1985 24.22);
--color-error-content: oklch(27% 0.1985 24.22);
--radius-selector: 2rem;
--radius-field: 0.25rem;
--radius-box: 0.5rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'silk',
    css: `color-scheme: light;
--color-base-100: oklch(97% 0.0035 67.78);
--color-base-200: oklch(95% 0.0081 61.42);
--color-base-300: oklch(90% 0.0081 61.42);
--color-base-content: oklch(40% 0.0081 61.42);
--color-primary: oklch(23.27% 0.0249 284.3);
--color-primary-content: oklch(94.22% 0.2505 117.44);
--color-secondary: oklch(23.27% 0.0249 284.3);
--color-secondary-content: oklch(73.92% 0.2135 50.94);
--color-accent: oklch(23.27% 0.0249 284.3);
--color-accent-content: oklch(88.92% 0.2061 189.9);
--color-neutral: oklch(20% 0 0);
--color-neutral-content: oklch(80% 0.0081 61.42);
--color-info: oklch(80.39% 0.1148 241.68);
--color-info-content: oklch(30.39% 0.1148 241.68);
--color-success: oklch(83.92% 0.0901 136.87);
--color-success-content: oklch(23.92% 0.0901 136.87);
--color-warning: oklch(83.92% 0.1085 80);
--color-warning-content: oklch(43.92% 0.1085 80);
--color-error: oklch(75.1% 0.1814 22.37);
--color-error-content: oklch(35.1% 0.1814 22.37);
--radius-selector: 2rem;
--radius-field: 0.5rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 2px;
--depth: 1;
--noise: 0;`,
  },
  {
    name: 'pastel',
    css: `color-scheme: light;
--color-base-100: oklch(100% 0 0);
--color-base-200: oklch(98.462% 0.001 247.838);
--color-base-300: oklch(92.462% 0.001 247.838);
--color-base-content: oklch(20% 0 0);
--color-primary: oklch(90% 0.063 306.703);
--color-primary-content: oklch(49% 0.265 301.924);
--color-secondary: oklch(89% 0.058 10.001);
--color-secondary-content: oklch(51% 0.222 16.935);
--color-accent: oklch(90% 0.093 164.15);
--color-accent-content: oklch(50% 0.118 165.612);
--color-neutral: oklch(55% 0.046 257.417);
--color-neutral-content: oklch(92% 0.013 255.508);
--color-info: oklch(86% 0.127 207.078);
--color-info-content: oklch(52% 0.105 223.128);
--color-success: oklch(87% 0.15 154.449);
--color-success-content: oklch(52% 0.154 150.069);
--color-warning: oklch(83% 0.128 66.29);
--color-warning-content: oklch(55% 0.195 38.402);
--color-error: oklch(80% 0.114 19.571);
--color-error-content: oklch(50% 0.213 27.518);
--radius-selector: 1rem;
--radius-field: 2rem;
--radius-box: 1rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 2px;
--depth: 0;
--noise: 0;`,
  },
]

const baseThemes = [
  { name: 'light', label: 'DaisyUI Light' },
  { name: 'dark', label: 'DaisyUI Dark' },
]

function formatThemeLabel(name) {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function renderThemeCss(theme) {
  const lines = theme.css
    .trim()
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n')

  return `:root[data-theme="${theme.name}"] {\n${lines}\n  --panel: var(--color-base-100);\n  --border: var(--color-base-300);\n  --text: var(--color-base-content);\n  --checker: var(--color-base-300);\n}\n`
}

await mkdir(outputDir, { recursive: true })

const samples = []
for (let i = 0; i < count; i += 1) {
  const seed = randomBytes(8).toString('hex')
  const svg = generateFoamSvg(seed, size)
  const filename = `foam-${i + 1}.svg`
  await writeFile(path.join(outputDir, filename), svg)
  samples.push({ seed, filename, svg })
}

const nobleRuntime = await buildNobleRuntime()
const foamSource = await readFile(path.resolve(__dirname, '..', 'src', 'foam.js'), 'utf8')
const runtimeSource = buildRuntimeSource(foamSource, nobleRuntime)
const previewSource = buildPreviewSource({ size })

await writeFile(path.join(outputDir, 'foam-runtime.js'), runtimeSource)
await writeFile(path.join(outputDir, 'preview.js'), previewSource)
await writeFile(
  path.join(outputDir, 'index.html'),
  buildHtml({ count, size, samples, runtimeSource, previewSource })
)

console.log(`Generated ${samples.length} previews in ${outputDir}`)

function buildRuntimeSource(source, depsSource) {
  const transformed = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+/gm, '')
  const depsBlock = depsSource ? `${depsSource}\n\n` : ''

  return `(() => {\n  if (window.foamIdenticon) { return }\n${depsBlock}${transformed}\n  window.foamIdenticon = { generateFoamSvg, generateFoamDataUrl }\n})()\n`
}

async function buildNobleRuntime() {
  const nobleDir = path.resolve(__dirname, '..', 'node_modules', '@noble', 'hashes', 'esm')
  const files = ['crypto.js', '_u64.js', 'utils.js', 'sha3.js']
  const sources = await Promise.all(
    files.map(file => readFile(path.join(nobleDir, file), 'utf8'))
  )
  const bundled = sources.map(stripModuleSyntax).join('\n')
  return stripNonAscii(bundled)
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+default\s+[^;]+;?\s*$/gm, '')
    .replace(/^export\s+\{[^}]+\};?\s*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class|async)\b)/gm, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
}

function stripNonAscii(source) {
  let output = ''
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
      output += source[i]
    }
  }
  return output
}

function buildPreviewSource({ size }) {
  return `(() => {
  const api = window.foamIdenticon
  if (!api || typeof api.generateFoamSvg !== 'function') {
    console.error('Foam identicon runtime not loaded')
    return
  }

  const { generateFoamSvg } = api

  const seedInput = document.getElementById('seedInput')
  const themeSelect = document.getElementById('themeSelect')
  const liveSvgLarge = document.getElementById('liveSvg64')
  const liveSvgMedium = document.getElementById('liveSvg32')
  const liveSvgSmall = document.getElementById('liveSvg16')

  document.documentElement.dataset.theme = themeSelect.value

  themeSelect.addEventListener('change', () => {
    document.documentElement.dataset.theme = themeSelect.value
    updatePreview()
  })

  const defaultSeed = 'simplepage.eth'
  seedInput.value = defaultSeed

  function updatePreview() {
    const value = seedInput.value || defaultSeed
    const svg = generateFoamSvg(value, ${size})
    liveSvgLarge.innerHTML = svg
    liveSvgMedium.innerHTML = svg
    liveSvgSmall.innerHTML = svg
  }

  let raf = null
  function scheduleUpdate() {
    if (raf) {
      cancelAnimationFrame(raf)
    }
    raf = requestAnimationFrame(updatePreview)
  }

  seedInput.addEventListener('input', scheduleUpdate)
  updatePreview()
})()
`
}

function buildHtml({ count, size, samples, runtimeSource, previewSource }) {
  const extraThemeCss = previewThemes.map(renderThemeCss).join('\n')
  const themeOptions = [
    ...baseThemes,
    ...previewThemes.map(theme => ({ name: theme.name, label: formatThemeLabel(theme.name) })),
  ]
  const themeOptionsMarkup = themeOptions
    .map(option => `<option value="${option.name}">${option.label}</option>`)
    .join('')
  const runtimeInline = escapeScript(runtimeSource)
  const previewInline = escapeScript(previewSource)

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Foam Identicon Preview</title>
    <style>
      :root {
        color-scheme: light;
        --color-base-100: oklch(100% 0 0);
        --color-base-200: oklch(98% 0 0);
        --color-base-300: oklch(95% 0 0);
        --color-base-content: oklch(21% 0.006 285.885);
        --color-primary: oklch(45% 0.24 277.023);
        --color-primary-content: oklch(93% 0.034 272.788);
        --color-secondary: oklch(65% 0.241 354.308);
        --color-secondary-content: oklch(94% 0.028 342.258);
        --color-accent: oklch(77% 0.152 181.912);
        --color-accent-content: oklch(38% 0.063 188.416);
        --color-neutral: oklch(14% 0.005 285.823);
        --color-neutral-content: oklch(92% 0.004 286.32);
        --color-info: oklch(74% 0.16 232.661);
        --color-info-content: oklch(29% 0.066 243.157);
        --color-success: oklch(76% 0.177 163.223);
        --color-success-content: oklch(37% 0.077 168.94);
        --color-warning: oklch(82% 0.189 84.429);
        --color-warning-content: oklch(41% 0.112 45.904);
        --color-error: oklch(71% 0.194 13.428);
        --color-error-content: oklch(27% 0.105 12.094);
        --panel: var(--color-base-100);
        --border: var(--color-base-300);
        --text: var(--color-base-content);
        --checker: var(--color-base-300);
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --color-base-100: oklch(25.33% 0.016 252.42);
        --color-base-200: oklch(23.26% 0.014 253.1);
        --color-base-300: oklch(21.15% 0.012 254.09);
        --color-base-content: oklch(97.807% 0.029 256.847);
        --color-primary: oklch(58% 0.233 277.117);
        --color-primary-content: oklch(96% 0.018 272.314);
        --color-secondary: oklch(65% 0.241 354.308);
        --color-secondary-content: oklch(94% 0.028 342.258);
        --color-accent: oklch(77% 0.152 181.912);
        --color-accent-content: oklch(38% 0.063 188.416);
        --color-neutral: oklch(14% 0.005 285.823);
        --color-neutral-content: oklch(92% 0.004 286.32);
        --color-info: oklch(74% 0.16 232.661);
        --color-info-content: oklch(29% 0.066 243.157);
        --color-success: oklch(76% 0.177 163.223);
        --color-success-content: oklch(37% 0.077 168.94);
        --color-warning: oklch(82% 0.189 84.429);
        --color-warning-content: oklch(41% 0.112 45.904);
        --color-error: oklch(71% 0.194 13.428);
        --color-error-content: oklch(27% 0.105 12.094);
        --panel: var(--color-base-100);
        --border: var(--color-base-300);
        --text: var(--color-base-content);
        --checker: var(--color-base-300);
      }
      ${extraThemeCss}
      body {
        margin: 0;
        font-family: "IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        background: var(--color-base-200);
        color: var(--text);
      }
      header {
        padding: 24px 32px 8px;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 20px;
        font-weight: 600;
      }
      p {
        margin: 0 0 6px;
        opacity: 0.75;
      }
      .live {
        padding: 8px 32px 0;
        display: grid;
        gap: 16px;
      }
      .live-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .live-controls label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.7;
      }
      .live-controls input,
      .live-controls select {
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 14px;
        min-width: 220px;
      }
      .live-card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        display: grid;
        grid-template-columns: minmax(0, 240px) 1fr;
        gap: 16px;
        align-items: center;
      }
      .live-images {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .live-image {
        border-radius: 10px;
        padding: 4px;
        box-sizing: border-box;
      }
      .live-image svg {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: inherit;
      }
      .live-image.size-64 {
        width: 64px;
        height: 64px;
      }
      .live-image.size-32 {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        padding: 3px;
      }
      .live-image.size-16 {
        width: 16px;
        height: 16px;
        border-radius: 6px;
        padding: 2px;
      }
      .live-meta {
        display: grid;
        gap: 10px;
        font-size: 12px;
      }
      .meta-label {
        display: inline-block;
        min-width: 52px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.7;
        margin-right: 8px;
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 20px;
        padding: 24px 32px 40px;
      }
      figure {
        margin: 0;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .thumbs {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .thumb {
        display: block;
        border-radius: 10px;
        overflow: hidden;
      }
      .thumb svg {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: inherit;
      }
      .thumb-64 {
        width: 64px;
        height: 64px;
      }
      .thumb-32 {
        width: 32px;
        height: 32px;
        border-radius: 6px;
      }
      .thumb-16 {
        width: 16px;
        height: 16px;
        border-radius: 4px;
      }
      figcaption {
        font-size: 12px;
        line-height: 1.3;
        word-break: break-all;
        opacity: 0.8;
      }
      @media (max-width: 720px) {
        .live-card {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Foam Identicon Preview</h1>
      <p>Count: ${count} | Base size: ${size}px (scaled to 64/32/16)</p>
    </header>
    <section class="live">
      <div class="live-controls">
        <label>
          Seed text
          <input id="seedInput" type="text" placeholder="Type to generate" />
        </label>
        <label>
          Theme
          <select id="themeSelect">
            ${themeOptionsMarkup}
          </select>
        </label>
      </div>
      <div class="live-card">
        <div class="live-images">
          <div id="liveSvg64" class="live-image size-64"></div>
          <div id="liveSvg32" class="live-image size-32"></div>
          <div id="liveSvg16" class="live-image size-16"></div>
        </div>
        <div class="live-meta">
          <div><span class="meta-label">Style</span><span>SimplePage Foam</span></div>
        </div>
      </div>
    </section>
    <main>
      ${samples
        .map(
          sample =>
            `<figure><div class="thumbs"><div class="thumb thumb-64">${sample.svg}</div><div class="thumb thumb-32">${sample.svg}</div><div class="thumb thumb-16">${sample.svg}</div></div><figcaption>${sample.seed}</figcaption></figure>`
        )
        .join('')}
    </main>
    <script>
${runtimeInline}
    </script>
    <script>
${previewInline}
    </script>
  </body>
</html>
`
}

function escapeScript(source) {
  return source.replace(/<\/script>/gi, '<\\/script>')
}
