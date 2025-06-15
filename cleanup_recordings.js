#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

function cleanupDoubleExtensionFiles(recordingDirectory) {
  try {
    if (!fs.existsSync(recordingDirectory)) {
      console.log(`📁 Directory not found: ${recordingDirectory}`);
      return;
    }

    const files = fs.readdirSync(recordingDirectory);
    const doubleExtensionFiles = files.filter(f => f.endsWith('.mp3.mp3'));
    
    if (doubleExtensionFiles.length === 0) {
      console.log('✅ No files with double .mp3 extensions found');
      return;
    }

    console.log(`🧹 Found ${doubleExtensionFiles.length} files with double .mp3 extensions:`);
    doubleExtensionFiles.forEach(file => console.log(`  - ${file}`));
    console.log('\n🔧 Fixing files...\n');
    
    for (const file of doubleExtensionFiles) {
      const oldPath = path.join(recordingDirectory, file);
      const newPath = path.join(recordingDirectory, file.replace('.mp3.mp3', '.mp3'));
      
      try {
        // Check if a file with the correct name already exists
        if (fs.existsSync(newPath)) {
          console.log(`⚠️  Target file already exists, removing duplicate: ${file}`);
          fs.unlinkSync(oldPath);
        } else {
          console.log(`✅ Renaming: ${file} → ${file.replace('.mp3.mp3', '.mp3')}`);
          fs.renameSync(oldPath, newPath);
        }
      } catch (error) {
        console.error(`❌ Failed to fix file ${file}:`, error.message);
      }
    }
    console.log('\n🎉 Cleanup completed!');
  } catch (error) {
    console.error('❌ Failed to cleanup double extension files:', error.message);
  }
}

// Main execution
const recordingDirectory = path.join(os.homedir(), 'Friday Recordings');
console.log(`📁 Cleaning up Friday Recordings directory: ${recordingDirectory}\n`);
cleanupDoubleExtensionFiles(recordingDirectory); 