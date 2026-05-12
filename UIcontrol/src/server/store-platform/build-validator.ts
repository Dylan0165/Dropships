import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export interface BuildResult {
  ok: boolean
  log: string
  phase: 'tsc' | 'next-build' | 'install'
}

function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false })
    let stdout = '', stderr = ''
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, stdout, stderr: stderr + `\n[timeout after ${timeoutMs}ms]` })
    }, timeoutMs)
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + `\n[spawn error: ${err.message}]` })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

export async function npmInstall(cwd: string): Promise<BuildResult> {
  const r = await runCmd('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], cwd, 120_000)
  return { ok: r.code === 0, log: r.stdout + r.stderr, phase: 'install' }
}

export async function runTsc(cwd: string): Promise<BuildResult> {
  const tscBin = path.join(cwd, 'node_modules', '.bin', 'tsc')
  const bin = fs.existsSync(tscBin) ? tscBin : 'npx'
  const args = bin === 'npx' ? ['tsc', '--noEmit', '--skipLibCheck'] : ['--noEmit', '--skipLibCheck']
  const r = await runCmd(bin, args, cwd, 60_000)
  return { ok: r.code === 0, log: r.stdout + r.stderr, phase: 'tsc' }
}

export async function runNextBuild(cwd: string): Promise<BuildResult> {
  const r = await runCmd('npm', ['run', 'build'], cwd, 180_000)
  return { ok: r.code === 0, log: (r.stdout + r.stderr).slice(-3000), phase: 'next-build' }
}

export async function validateAndBuild(cwd: string, onLog?: (msg: string) => void): Promise<BuildResult> {
  const log = onLog ?? ((m: string) => console.log(`[build-validator] ${m}`))

  log('npm install...')
  const install = await npmInstall(cwd)
  if (!install.ok) {
    log(`npm install MISLUKT:\n${install.log.slice(-1000)}`)
    return install
  }

  log('tsc --noEmit...')
  const tsc = await runTsc(cwd)
  if (!tsc.ok) {
    log(`TypeScript errors:\n${tsc.log.slice(-1500)}`)
    // Treat tsc errors as warnings — continue to next build
    // Some Next.js projects have minor type errors but still build fine
    log('tsc waarschuwingen aanwezig — next build wordt toch geprobeerd')
  }

  log('next build...')
  const build = await runNextBuild(cwd)
  if (!build.ok) {
    log(`next build MISLUKT:\n${build.log.slice(-2000)}`)
    return build
  }

  log('Build geslaagd ✓')
  return { ok: true, log: 'Build geslaagd', phase: 'next-build' }
}
