[CmdletBinding()]
param([string]$AgentHome=(Join-Path $env:USERPROFILE '.agents'))
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$links=@{
 '.agents/experts/software-architect'='experts/software-architect'
 '.agents/experts/visual-designer'='experts/visual-designer'
 '.agents/development-skills/project-docs'='skills/project-docs'
 '.agents/skills/arch-plan'='experts/software-architect/kit/skills/arch-plan'
 '.agents/skills/arch-review'='experts/software-architect/kit/skills/arch-review'
 '.agents/resources/software-architect/kit'='experts/software-architect/kit'
}
foreach($relative in $links.Keys){
 $source=Join-Path $AgentHome $links[$relative];$target=Join-Path $root $relative
 if(-not(Test-Path -LiteralPath $source -PathType Container)){Write-Warning "Optional developer resource missing: $source";continue}
 if(Test-Path -LiteralPath $target){
  $item=Get-Item -LiteralPath $target -Force
  if($item.LinkType -eq 'Junction' -and [IO.Path]::GetFullPath($item.Target) -eq [IO.Path]::GetFullPath($source)){continue}
  throw "Developer reference already exists; preserve it and reconcile explicitly: $relative"
 }
 New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
 New-Item -ItemType Junction -Path $target -Target $source | Out-Null
}
$registry=Join-Path $root '.agents/distribution.json'
if(-not(Test-Path -LiteralPath $registry)){
 $source=Join-Path $AgentHome 'distribution.json'
 if(Test-Path -LiteralPath $source){New-Item -ItemType SymbolicLink -Path $registry -Target $source | Out-Null}
}
Write-Output 'Developer references prepared. Source remains in Agent Home; these ignored links are not product dependencies or release contents.'
