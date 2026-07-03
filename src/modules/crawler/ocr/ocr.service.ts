import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createWorker } from 'tesseract.js';
const sharpLib = require('sharp');

export interface OcrResult {
  text: string;
  confidence: number;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async recognizeImage(imagePath: string): Promise<OcrResult> {
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    let enhancedPath: string | null = null;
    try {
      if (!this.isImageReadable(imagePath)) {
        this.logger.warn(`OCR skipped, image unreadable: ${imagePath}`);
        return { text: '', confidence: 0 };
      }

      worker = await createWorker('chi_sim', 1, {
        langPath: `file://${process.cwd()}`,
      });

      enhancedPath = await this.createEnhancedImage(imagePath);
      const rawBuffer = fs.readFileSync(imagePath);
      const enhancedBuffer = fs.readFileSync(enhancedPath);

      const rawResult = await worker.recognize(rawBuffer);
      const enhancedResult = await worker.recognize(enhancedBuffer);
      const raw = {
        text: rawResult.data.text ?? '',
        confidence: rawResult.data.confidence ?? 0,
      };
      const enhanced = {
        text: enhancedResult.data.text ?? '',
        confidence: enhancedResult.data.confidence ?? 0,
      };
      const mergedText = this.mergeText(raw.text, enhanced.text);

      return {
        text: mergedText,
        confidence: Math.max(raw.confidence, enhanced.confidence),
      };
    } catch (error) {
      this.logger.warn(`OCR failed for ${imagePath}: ${String(error)}`);
      return { text: '', confidence: 0 };
    } finally {
      if (enhancedPath && fs.existsSync(enhancedPath)) {
        fs.unlinkSync(enhancedPath);
      }
      if (worker) {
        await worker.terminate().catch(() => undefined);
      }
    }
  }

  private isImageReadable(imagePath: string): boolean {
    try {
      if (!fs.existsSync(imagePath)) return false;
      const stat = fs.statSync(imagePath);
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }

  private async createEnhancedImage(imagePath: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `ocr_enhanced_${Date.now()}.png`);
    const meta = await sharpLib(imagePath).metadata();
    const baseWidth = meta.width ?? 0;
    const targetWidth = baseWidth > 0 ? Math.max(Math.round(baseWidth * 1.6), baseWidth) : undefined;

    await sharpLib(imagePath)
      .removeAlpha()
      .resize({ width: targetWidth, kernel: sharpLib.kernel.lanczos3 })
      .linear(1.6, -20)
      .normalise()
      .grayscale()
      .threshold(150)
      .toFile(outPath);

    return outPath;
  }

  private mergeText(rawText: string, enhancedText: string): string {
    const normalizedRaw = rawText.trim();
    const normalizedEnhanced = enhancedText.trim();
    if (!normalizedRaw) return normalizedEnhanced;
    if (!normalizedEnhanced) return normalizedRaw;

    const lines = new Set<string>();
    const merged: string[] = [];

    for (const line of normalizedRaw.split('\n')) {
      const text = line.trim();
      if (!text || lines.has(text)) continue;
      lines.add(text);
      merged.push(text);
    }
    for (const line of normalizedEnhanced.split('\n')) {
      const text = line.trim();
      if (!text || lines.has(text) || text.length < 2) continue;
      lines.add(text);
      merged.push(text);
    }
    return merged.join('\n');
  }
}
