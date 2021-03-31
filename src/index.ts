import yargs, { string } from "yargs";
import { hideBin } from "yargs/helpers";
import { homedir } from "os";
import { join } from "path";
import { exec as _exec } from "child_process";
import { readdir as _readdir, stat as _stat, statSync, rm as _rm } from "fs";
import { promisify } from "util";
const readdir = promisify(_readdir);
const stat = promisify(_stat);
const rm = promisify(_rm);
const exec = promisify(_exec);
const argv = yargs(hideBin(process.argv))
    .option('backup', {
        alias: 'b',
        describe: 'Create a new backup',
        boolean: true,
    })
    .option('delete', {
        alias: 'd',
        describe: 'Delete old backup files',
        boolean: true,
    })
    .option('delete-days', {
        describe: 'Delete old backup files older than "n" days',
        number: true,
        default: 20,
    })
    .option('sync', {
        alias: 's',
        describe: 'Sync with S3 bucket',
        boolean: true,
    })
    .option('user', {
        alias: 'u',
        describe: 'The username with backup priviledges in mysql/mariadb',
        string: true,
        demandOption: true,
    })
    .option('password', {
        alias: 'p',
        describe: 'The password of the user with backup priviledges in mysql/mariadb',
        string: true,
        demandOption: true,
    })
    .option('backup-dir', {
        describe: 'The directory where to store the backup files',
        string: true,
        default: join(homedir(), 'mariadb-backups'),
    })
    .argv;

const BACKUPS_DIR = argv["backup-dir"];

async function createNewBackup() {
    // create filename
    const now = new Date();
    const filename = `${now.toISOString()}_database_dump.sql`;

    // dump all mariadb databases
    await exec(`mysqldump --all-databases -u${argv.user} -p${argv.password} > ${join(BACKUPS_DIR, filename)}`);
    console.log(`Created new mariadb backup with filename ${filename}`);

    // gzip the resulting file
    await exec(`gzip -9 ${join(BACKUPS_DIR, filename)}`);
    console.log(`Gzipped ${filename}`);
}

async function deleteOldBackups(daysPrior: number = 20) {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - daysPrior);

    const allFiles = await readdir(BACKUPS_DIR);
    const oldBackupFiles = allFiles.filter((filename) => filterOldBackupFiles(cutoffDate, filename));

    if (oldBackupFiles.length > 0) {
        console.log(`There are ${oldBackupFiles.length} old backups that will be deleted`);

        oldBackupFiles.forEach(async filename => {
            await rm(join(BACKUPS_DIR, filename));
        });
        console.log(`Deleted ${oldBackupFiles.length} old backup files`);
    }
    else {
        console.log(`No old backup files to delete`);
    }
}

function filterOldBackupFiles(cutoffDate: Date, filename: string): boolean {
    if (/.*\.sql\.gz$/.test(filename)) {
        const { birthtime } = statSync(join(BACKUPS_DIR, filename));
        if (birthtime.valueOf() < cutoffDate.valueOf()) {
            return true;
        }
        return false;
    }
    return false;
}

async function syncWithS3() {
    // sync the backups folder with S3
    await exec(`aws s3 sync ${BACKUPS_DIR} s3://rbyc-mariadb-backups/mariadb-backups --delete --storage-class GLACIER`);
    console.log(`Synched mariadb backups with S3`);
}

(async () => {
    if (argv.backup) {
        await createNewBackup();
    }
    if (argv.delete) {
        await deleteOldBackups(argv["delete-days"]);
    }
    if (argv.sync) {
        await syncWithS3();
    }
    while (-1) {

    }
})();
