package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

type FileStat struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	Status string `json:"status"`
}

type SubtitleBlock struct {
	StartMs int64
	EndMs   int64
	Text    []string
}

var (
	timestampRegex = regexp.MustCompile(`(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})`)
	shell32        = syscall.NewLazyDLL("shell32.dll")
	fileOp         = shell32.NewProc("SHFileOperationW")
)

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.Log("Info", "LrcKit started. Ready.")
}

func (a *App) Log(level string, msg string) {
	runtime.EventsEmit(a.ctx, "app-log", map[string]string{
		"level": level,
		"msg":   msg,
		"time":  strings.Split(fmt.Sprintf("%v", os.Getpid()), ".")[0],
	})
}

func (a *App) SelectDir() string {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Folder",
	})
	if err != nil {
		a.Log("Error", "Dialog failed: "+err.Error())
		return ""
	}
	return dir
}

func (a *App) ScanFiles(dir string) []FileStat {
	a.Log("Info", "Scanning VTT/SRT in: "+dir)
	return a.scanRecursive(dir, []string{".vtt", ".srt"})
}

func (a *App) ScanByExt(dir string, extString string) []FileStat {
	a.Log("Info", fmt.Sprintf("Scanning extensions [%s] in: %s", extString, dir))
	exts := a.parseExtString(extString)
	return a.scanRecursive(dir, exts)
}

func (a *App) ScanDropped(paths []string, mode string, extString string) []FileStat {
	allFiles := make([]FileStat, 0)

	var targetExts []string
	if mode == "convert" {
		targetExts = []string{".vtt", ".srt"}
		a.Log("Info", fmt.Sprintf("Drag processing: %d paths (Mode: Converter)", len(paths)))
	} else {
		targetExts = a.parseExtString(extString)
		a.Log("Info", fmt.Sprintf("Drag processing: %d paths (Mode: Cleaner)", len(paths)))
	}

	extMap := make(map[string]bool)
	for _, e := range targetExts {
		extMap[e] = true
	}

	for _, p := range paths {
		p = filepath.Clean(p)
		info, err := os.Stat(p)
		if err != nil {
			a.Log("Error", fmt.Sprintf("Read error: %s", filepath.Base(p)))
			continue
		}

		if info.IsDir() {
			subFiles := a.scanRecursive(p, targetExts)
			allFiles = append(allFiles, subFiles...)
		} else {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if extMap[ext] {
				allFiles = append(allFiles, FileStat{
					ID:     p,
					Name:   info.Name(),
					Path:   p,
					Status: "pending",
				})
			}
		}
	}

	a.Log("Success", fmt.Sprintf("Loaded %d files from drag & drop", len(allFiles)))
	return allFiles
}

func (a *App) parseExtString(extString string) []string {
	raw := strings.Split(extString, ",")
	var result []string
	for _, e := range raw {
		clean := strings.TrimSpace(strings.ToLower(e))
		if clean != "" {
			if !strings.HasPrefix(clean, ".") {
				clean = "." + clean
			}
			result = append(result, clean)
		}
	}
	return result
}

func (a *App) scanRecursive(dir string, exts []string) []FileStat {
	files := make([]FileStat, 0)
	targetExts := make(map[string]bool)
	for _, e := range exts {
		targetExts[e] = true
	}

	filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if d.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(d.Name()))
		if targetExts[ext] {
			files = append(files, FileStat{
				ID:     path,
				Name:   d.Name(),
				Path:   path,
				Status: "pending",
			})
		}
		return nil
	})
	return files
}

func (a *App) ConvertVtt(srcPath string, deleteSource bool) string {
	blocks, err := parseSubtitleFile(srcPath)
	if err != nil {
		a.Log("Error", fmt.Sprintf("Parse failed: %s", filepath.Base(srcPath)))
		return "error"
	}
	if len(blocks) == 0 {
		a.Log("Warn", fmt.Sprintf("Empty/Invalid file: %s", filepath.Base(srcPath)))
		return "failed"
	}

	lrcLines := make([]string, 0, len(blocks)*2)
	for i, block := range blocks {
		timeTag := formatLrcTimestamp(block.StartMs)
		text := strings.Join(block.Text, " ")
		lrcLines = append(lrcLines, timeTag+text)
		if i < len(blocks)-1 {
			nextStart := blocks[i+1].StartMs
			if block.EndMs < nextStart {
				lrcLines = append(lrcLines, formatLrcTimestamp(block.EndMs))
			}
		} else {
			lrcLines = append(lrcLines, formatLrcTimestamp(block.EndMs))
		}
	}

	basePath := srcPath[:len(srcPath)-len(filepath.Ext(srcPath))]
	lrcPath := basePath + ".lrc"
	ext := strings.ToLower(filepath.Ext(basePath))
	if ext == ".wav" || ext == ".mp3" || ext == ".flac" || ext == ".m4a" {
		lrcPath = strings.TrimSuffix(basePath, ext) + ".lrc"
	}

	content := strings.Join(lrcLines, "\n")
	if err := os.WriteFile(lrcPath, []byte(content), 0644); err != nil {
		a.Log("Error", "Write failed: "+err.Error())
		return "write_error"
	}

	if deleteSource {
		code := a.moveToTrash(srcPath)
		if code != 0 {
			a.Log("Warn", fmt.Sprintf("Converted but delete failed (Code %d)", code))
		} else {
			a.Log("Success", "Converted & Deleted: "+filepath.Base(srcPath))
		}
	} else {
		a.Log("Success", "Converted: "+filepath.Base(srcPath))
	}
	return "success"
}

func (a *App) RecycleFiles(paths []string) int {
	a.Log("Info", fmt.Sprintf("Batch recycling %d files...", len(paths)))
	count := 0
	for _, p := range paths {
		if a.moveToTrash(p) == 0 {
			count++
		} else {
			a.Log("Error", "Recycle failed: "+filepath.Base(p))
		}
	}
	a.Log("Info", fmt.Sprintf("Recycle complete. Success: %d/%d", count, len(paths)))
	return count
}

func (a *App) moveToTrash(path string) int {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return 9999
	}
	pathUtf16, err := syscall.UTF16FromString(absPath)
	if err != nil {
		return 9998
	}
	pathUtf16 = append(pathUtf16, 0)

	op := &SHFILEOPSTRUCT{
		Hwnd:  0,
		Func:  0x0003,
		From:  &pathUtf16[0],
		To:    nil,
		Flags: 0x0040 | 0x0010 | 0x0004,
	}

	ret, _, _ := fileOp.Call(uintptr(unsafe.Pointer(op)))
	return int(ret)
}

func parseSubtitleFile(path string) ([]SubtitleBlock, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var blocks []SubtitleBlock
	scanner := bufio.NewScanner(f)
	var currentBlock SubtitleBlock
	inBlock := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			if inBlock {
				blocks = append(blocks, currentBlock)
				currentBlock = SubtitleBlock{}
				inBlock = false
			}
			continue
		}
		if line == "WEBVTT" || strings.HasPrefix(line, "NOTE") {
			continue
		}
		if strings.Contains(line, "-->") {
			start, end, ok := parseTimeLine(line)
			if ok {
				if inBlock {
					blocks = append(blocks, currentBlock)
				}
				currentBlock = SubtitleBlock{
					StartMs: start,
					EndMs:   end,
					Text:    []string{},
				}
				inBlock = true
				continue
			}
		}
		if inBlock {
			isIndex, _ := regexp.MatchString(`^\d+$`, line)
			if !isIndex {
				line = removeTags(line)
				if line != "" {
					currentBlock.Text = append(currentBlock.Text, line)
				}
			}
		}
	}
	if inBlock {
		blocks = append(blocks, currentBlock)
	}
	return blocks, nil
}

func parseTimeLine(line string) (int64, int64, bool) {
	matches := timestampRegex.FindAllStringSubmatch(line, 2)
	if len(matches) < 2 {
		return 0, 0, false
	}
	return parseDuration(matches[0]), parseDuration(matches[1]), true
}

func parseDuration(matches []string) int64 {
	h, _ := strconv.Atoi(matches[1])
	m, _ := strconv.Atoi(matches[2])
	s, _ := strconv.Atoi(matches[3])
	ms, _ := strconv.Atoi(matches[4])
	return int64(h)*3600000 + int64(m)*60000 + int64(s)*1000 + int64(ms)
}

func formatLrcTimestamp(ms int64) string {
	totalSec := ms / 1000
	m := totalSec / 60
	s := totalSec % 60
	cs := (ms % 1000) / 10
	return fmt.Sprintf("[%02d:%02d.%02d]", m, s, cs)
}

func removeTags(text string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return re.ReplaceAllString(text, "")
}

type SHFILEOPSTRUCT struct {
	Hwnd  uintptr
	Func  uint32
	_     uint32
	From  *uint16
	To    *uint16
	Flags uint16
	Abort int32
	HName uintptr
	Title *uint16
}
