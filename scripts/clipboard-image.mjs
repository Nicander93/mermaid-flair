import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export async function checkClipboardImage() {
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-STA', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; $image = [System.Windows.Forms.Clipboard]::GetImage(); if ($null -eq $image) { throw "No clipboard image" }; Write-Output ($image.Width.ToString() + "x" + $image.Height.ToString()); $image.Dispose()'], { windowsHide: true })
  if (!/^\d+x\d+\s*$/.test(stdout)) throw new Error('Clipboard did not contain an image with readable dimensions.')
  console.log('Clipboard image:', stdout.trim())
}
