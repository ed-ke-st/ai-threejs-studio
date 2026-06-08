import type { FastifyReply } from "fastify";
import { zipDirectory } from "../export/zip.js";

export class ExportService {
  async zipDirectory(sourceDir: string, reply: FastifyReply, fileName: string): Promise<void> {
    const archive = await zipDirectory(sourceDir, {
      rootFolder: fileName.replace(/\.zip$/i, ""),
      exclude: ["node_modules/**", "dist/**", ".studio/**", "*.log", ".DS_Store"]
    });

    reply.header("content-type", "application/zip");
    reply.header("content-disposition", `attachment; filename="${fileName}"`);
    reply.send(archive);
  }

  async zipBuild(buildDir: string, reply: FastifyReply, fileName: string): Promise<void> {
    const archive = await zipDirectory(buildDir, {
      rootFolder: fileName.replace(/\.zip$/i, "")
    });

    reply.header("content-type", "application/zip");
    reply.header("content-disposition", `attachment; filename="${fileName}"`);
    reply.send(archive);
  }
}
