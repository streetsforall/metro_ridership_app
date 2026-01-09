// ShareUrl.tsx


export default function ShareUrl({ url }: { url: string }) {
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            alert('URL copied to clipboard!');
        } catch {
            alert('Failed to copy URL.');
        }
    };

    return (
        <div>
            <button onClick={handleCopy}>Copy URL</button>
        </div>
    );
}